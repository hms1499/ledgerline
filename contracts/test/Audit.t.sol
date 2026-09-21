// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayoutAnchor} from "../src/PayoutAnchor.sol";

/**
 * @dev Regression suite for the pre-mainnet audit. Two findings were fixed and
 *      are locked shut here; two were accepted as intended behaviour and are
 *      pinned so a later change has to face them deliberately.
 */
contract AuditTest is Test {
    PayoutAnchor anchor;
    address payer = address(0xA11CE);
    address attacker = address(0xBAD);

    address constant TOKEN = 0x3600000000000000000000000000000000000000;
    address constant ALICE = address(0x2222);
    address constant BOB = address(0x3333);
    bytes32 constant MEMO_A = keccak256("memo-a");
    bytes32 constant MEMO_B = keccak256("memo-b");

    function setUp() public {
        anchor = new PayoutAnchor();
    }

    function _leaf(bytes32 memoId, address token, address to, uint256 amount)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encode(memoId, token, to, amount));
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a <= b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    function _commitTwo() internal returns (bytes32 runId, bytes32 root) {
        bytes32 la = _leaf(MEMO_A, TOKEN, ALICE, 1_000_000);
        bytes32 lb = _leaf(MEMO_B, TOKEN, BOB, 2_500_000);
        root = _pair(la, lb);
        vm.prank(payer);
        anchor.commit(keccak256("RUN"), root, 2);
        runId = anchor.runIdFor(payer, keccak256("RUN"));
    }

    // ── FIXED (M-1) ─────────────────────────────────────────────────────────
    // verifyItem used to take a caller-supplied `leaf`, so the root and every
    // internal node verified as members. It now takes the fields and derives
    // the leaf, which makes both unreachable through the public API.

    function test_M1_fixed_rootNoLongerPassesAsAMember() public {
        (bytes32 runId, bytes32 root) = _commitTwo();
        bytes32[] memory empty = new bytes32[](0);
        assertFalse(anchor.verifyItem(runId, root, TOKEN, ALICE, 1_000_000, empty));
    }

    function test_M1_fixed_internalNodeNoLongerPassesAsAMember() public {
        (bytes32 runId,) = _commitTwo();
        bytes32 la = _leaf(MEMO_A, TOKEN, ALICE, 1_000_000);
        bytes32[] memory empty = new bytes32[](0);
        // Feeding a node hash would require it to BE a derived leaf; it is not.
        assertFalse(anchor.verifyItem(runId, la, TOKEN, ALICE, 1_000_000, empty));
    }

    function test_M1_fixed_honestMemberStillVerifies() public {
        (bytes32 runId,) = _commitTwo();
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = _leaf(MEMO_B, TOKEN, BOB, 2_500_000);
        assertTrue(anchor.verifyItem(runId, MEMO_A, TOKEN, ALICE, 1_000_000, proof));
    }

    // ── FIXED (L-2) ─────────────────────────────────────────────────────────

    function test_L2_fixed_missingRunIsDistinguishableFromBadProof() public {
        (bytes32 runId,) = _commitTwo();
        bytes32 ghost = anchor.runIdFor(attacker, keccak256("RUN"));

        assertTrue(anchor.isCommitted(runId));
        assertFalse(anchor.isCommitted(ghost));
    }

    // ── ACCEPTED (L-1) ──────────────────────────────────────────────────────
    // The contract never sees the leaves, so it cannot check itemCount against
    // the tree. Documented as a display hint, not a trusted count.

    function test_L1_accepted_itemCountIsSelfDeclared() public {
        vm.prank(payer);
        anchor.commit(keccak256("RUN"), keccak256("root-of-400-leaves"), 1);
        (,, uint32 itemCount,) = anchor.runs(anchor.runIdFor(payer, keccak256("RUN")));
        assertEq(itemCount, 1, "stored the claim, as designed");
    }

    // ── ACCEPTED (I-1) ──────────────────────────────────────────────────────
    // Anyone may commit any root under their own id. runId is namespaced by
    // msg.sender, so this is noise in someone else's namespace, not a takeover.

    function test_I1_accepted_attackerCannotSquatThePayersRunId() public {
        vm.prank(attacker);
        anchor.commit(keccak256("RUN"), keccak256("garbage"), 999);

        (, address stored,,) = anchor.runs(anchor.runIdFor(attacker, keccak256("RUN")));
        assertEq(stored, attacker);

        (, address untouched,,) = anchor.runs(anchor.runIdFor(payer, keccak256("RUN")));
        assertEq(untouched, address(0), "payer's namespace is unreachable to the attacker");
    }
}
