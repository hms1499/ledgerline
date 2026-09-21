// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

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
 */
contract PayoutAnchor {
    struct Run {
        address payer;
        bytes32 root;
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

    function commit(bytes32 clientRunId, bytes32 root, uint32 itemCount) external {
        if (root == bytes32(0) || itemCount == 0) revert EmptyRun();

        bytes32 runId = runIdFor(msg.sender, clientRunId);
        if (runs[runId].payer != address(0)) revert RunExists();

        runs[runId] = Run({
            payer: msg.sender,
            root: root,
            itemCount: itemCount,
            timestamp: uint64(block.timestamp)
        });

        emit RunCommitted(runId, msg.sender, root, itemCount);
    }

    function verifyItem(bytes32 runId, bytes32 leaf, bytes32[] calldata proof)
        external
        view
        returns (bool)
    {
        bytes32 root = runs[runId].root;
        if (root == bytes32(0)) return false;
        return MerkleProof.verify(proof, root, leaf);
    }
}
