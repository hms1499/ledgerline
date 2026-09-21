// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title PayoutAnchor
 * @notice Commits the Merkle root of an intended payout run so recipients can
 *         prove their own line was part of it, and so payments present on chain
 *         but absent from the manifest are detectable.
 *
 * @dev Holds no funds, has no owner, is not upgradeable, and cannot block a
 *      payment. It is an evidence layer only.
 *
 *      Called as a sibling subcall inside Multicall3From.aggregate3, where
 *      Arc's CallFrom precompile preserves the payer EOA as msg.sender — which
 *      is why deriving runId from msg.sender is safe. This contract must never
 *      be the caller in the payment path: CallFrom rejects sender spoofing, so
 *      a contract calling Memo reverts.
 *
 *      SCOPE OF THE GUARANTEE. A commitment proves that this payer declared
 *      this root at this time, once. It does NOT prove the transaction's
 *      payments match the root — nothing on chain binds the two, because this
 *      contract cannot be the caller. Detecting a divergence is the
 *      reconciler's job. Do not read a commitment as proof of correct payment.
 */
contract PayoutAnchor {
    /**
     * @dev Field order is load-bearing, not cosmetic. `root` takes a whole slot
     *      either way, so putting it first lets payer+itemCount+timestamp pack
     *      into exactly 32 bytes (20+4+8) and the struct costs two slots rather
     *      than three. Measured: 22,140 gas per commit, ~30%.
     */
    struct Run {
        bytes32 root;
        address payer;
        uint32 itemCount;
        uint64 timestamp;
    }

    mapping(bytes32 => Run) public runs;

    event RunCommitted(
        bytes32 indexed runId, address indexed payer, bytes32 root, uint32 itemCount
    );

    error RunExists();
    error EmptyRun();

    /// @dev Derived from msg.sender so two payers can never collide and nobody
    ///      can front-run and squat another payer's run id.
    function runIdFor(address payer, bytes32 clientRunId) public pure returns (bytes32) {
        return keccak256(abi.encode(payer, clientRunId));
    }

    /**
     * @param itemCount Self-declared, and deliberately unverified — the
     *        contract never sees the leaves, so it cannot check this against
     *        the tree. Treat it as a display hint from the payer, never as a
     *        trusted count.
     */
    function commit(bytes32 clientRunId, bytes32 root, uint32 itemCount) external {
        if (root == bytes32(0) || itemCount == 0) revert EmptyRun();

        bytes32 runId = runIdFor(msg.sender, clientRunId);
        if (runs[runId].payer != address(0)) revert RunExists();

        runs[runId] = Run({
            root: root,
            payer: msg.sender,
            itemCount: itemCount,
            timestamp: uint64(block.timestamp)
        });

        emit RunCommitted(runId, msg.sender, root, itemCount);
    }

    /// @notice Whether a run was ever committed. Lets a caller tell "no such
    ///         run" apart from "proof did not verify", which a lone bool from
    ///         verifyItem cannot express.
    function isCommitted(bytes32 runId) external view returns (bool) {
        return runs[runId].payer != address(0);
    }

    /**
     * @notice Prove one payout line belongs to a committed run.
     *
     * @dev Takes the line's FIELDS and derives the leaf here. It deliberately
     *      does not accept a caller-supplied `leaf`: with a bare bytes32, the
     *      root and every internal node verify as members, because
     *      MerkleProof.processProof returns the leaf unchanged for an empty
     *      proof. Deriving the leaf makes that unreachable — a forger would
     *      need a 128-byte preimage hashing to a 64-byte-preimage node.
     */
    function verifyItem(
        bytes32 runId,
        bytes32 memoId,
        address token,
        address to,
        uint256 amount,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 root = runs[runId].root;
        if (root == bytes32(0)) return false;

        bytes32 leaf = keccak256(abi.encode(memoId, token, to, amount));
        return MerkleProof.verifyCalldata(proof, root, leaf);
    }
}
