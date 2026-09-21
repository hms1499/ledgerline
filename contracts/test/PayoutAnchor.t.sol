// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayoutAnchor} from "../src/PayoutAnchor.sol";

contract PayoutAnchorTest is Test {
    PayoutAnchor anchor;

    address payerA = address(0xA11CE);
    address payerB = address(0xB0B);
    bytes32 constant CLIENT_RUN = keccak256("RUN-2026-09");
    bytes32 constant ROOT = keccak256("root");

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

    function test_commitStoresRunUnderDerivedId() public {
        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, ROOT, 3);

        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);
        (bytes32 root, address payer, uint32 itemCount,) = anchor.runs(runId);

        assertEq(payer, payerA);
        assertEq(root, ROOT);
        assertEq(itemCount, 3);
    }

    function test_twoPayersCannotCollideOnTheSameClientRunId() public {
        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, ROOT, 1);
        vm.prank(payerB);
        anchor.commit(CLIENT_RUN, ROOT, 1); // must not revert

        assertTrue(anchor.runIdFor(payerA, CLIENT_RUN) != anchor.runIdFor(payerB, CLIENT_RUN));
    }

    function test_replayIsRejected() public {
        vm.startPrank(payerA);
        anchor.commit(CLIENT_RUN, ROOT, 1);
        vm.expectRevert(PayoutAnchor.RunExists.selector);
        anchor.commit(CLIENT_RUN, ROOT, 1);
        vm.stopPrank();
    }

    function test_rejectsEmptyRun() public {
        vm.startPrank(payerA);
        vm.expectRevert(PayoutAnchor.EmptyRun.selector);
        anchor.commit(CLIENT_RUN, bytes32(0), 1);
        vm.expectRevert(PayoutAnchor.EmptyRun.selector);
        anchor.commit(CLIENT_RUN, ROOT, 0);
        vm.stopPrank();
    }

    function test_verifyItemAcceptsAValidProof() public {
        bytes32 la = _leaf(MEMO_A, TOKEN, ALICE, 1_000_000);
        bytes32 lb = _leaf(MEMO_B, TOKEN, BOB, 2_500_000);

        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, _pair(la, lb), 2);
        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = lb;
        assertTrue(anchor.verifyItem(runId, MEMO_A, TOKEN, ALICE, 1_000_000, proof));
    }

    function test_verifyItemRejectsATamperedAmount() public {
        bytes32 la = _leaf(MEMO_A, TOKEN, ALICE, 1_000_000);
        bytes32 lb = _leaf(MEMO_B, TOKEN, BOB, 2_500_000);

        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, _pair(la, lb), 2);
        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = lb;
        assertFalse(anchor.verifyItem(runId, MEMO_A, TOKEN, ALICE, 1_000_001, proof));
    }

    function test_verifyItemRejectsASubstitutedRecipient() public {
        bytes32 la = _leaf(MEMO_A, TOKEN, ALICE, 1_000_000);
        bytes32 lb = _leaf(MEMO_B, TOKEN, BOB, 2_500_000);

        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, _pair(la, lb), 2);
        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = lb;
        assertFalse(anchor.verifyItem(runId, MEMO_A, TOKEN, BOB, 1_000_000, proof));
    }

    function test_verifyItemReturnsFalseForAnUncommittedRun() public view {
        bytes32[] memory proof = new bytes32[](0);
        assertFalse(anchor.verifyItem(keccak256("nope"), MEMO_A, TOKEN, ALICE, 1, proof));
    }

    // ── audit M-1 regression ────────────────────────────────────────────────
    // The old signature took a caller-supplied `leaf`, so the root itself and
    // every internal node verified as a member. Taking the fields instead makes
    // that unreachable: a forger would need a 128-byte preimage hashing to an
    // internal node, not merely the node's hash.

    function test_M1_rootCannotBeReplayedAsAMember() public {
        bytes32 la = _leaf(MEMO_A, TOKEN, ALICE, 1_000_000);
        bytes32 lb = _leaf(MEMO_B, TOKEN, BOB, 2_500_000);
        bytes32 root = _pair(la, lb);

        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, root, 2);
        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);

        // There is no longer any way to hand the contract a bare bytes32. The
        // only reachable leaves are keccak256(abi.encode(...)) of real fields.
        bytes32[] memory empty = new bytes32[](0);
        assertFalse(anchor.verifyItem(runId, root, TOKEN, ALICE, 1_000_000, empty));
        assertFalse(anchor.verifyItem(runId, bytes32(0), address(0), address(0), 0, empty));
    }

    function test_isCommittedDistinguishesMissingRunFromBadProof() public {
        assertFalse(anchor.isCommitted(anchor.runIdFor(payerA, CLIENT_RUN)));

        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, ROOT, 1);

        assertTrue(anchor.isCommitted(anchor.runIdFor(payerA, CLIENT_RUN)));
    }

    function test_emitsRunCommitted() public {
        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);
        vm.expectEmit(true, true, false, true);
        emit PayoutAnchor.RunCommitted(runId, payerA, ROOT, 3);
        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, ROOT, 3);
    }
}
