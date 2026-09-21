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

    function setUp() public {
        anchor = new PayoutAnchor();
    }

    function test_commitStoresRunUnderDerivedId() public {
        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, ROOT, 3);

        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);
        (address payer, bytes32 root, uint32 itemCount,) = anchor.runs(runId);

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
        bytes32 l1 = keccak256("leaf-1");
        bytes32 l2 = keccak256("leaf-2");
        bytes32 root = l1 <= l2 ? keccak256(abi.encodePacked(l1, l2)) : keccak256(abi.encodePacked(l2, l1));

        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, root, 2);
        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = l2;
        assertTrue(anchor.verifyItem(runId, l1, proof));
    }

    function test_verifyItemRejectsAForgedLeaf() public {
        bytes32 l1 = keccak256("leaf-1");
        bytes32 l2 = keccak256("leaf-2");
        bytes32 root = l1 <= l2 ? keccak256(abi.encodePacked(l1, l2)) : keccak256(abi.encodePacked(l2, l1));

        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, root, 2);
        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = l2;
        assertFalse(anchor.verifyItem(runId, keccak256("forged"), proof));
    }

    function test_verifyItemReturnsFalseForAnUncommittedRun() public {
        bytes32[] memory proof = new bytes32[](0);
        assertFalse(anchor.verifyItem(keccak256("nope"), keccak256("leaf"), proof));
    }

    function test_emitsRunCommitted() public {
        bytes32 runId = anchor.runIdFor(payerA, CLIENT_RUN);
        vm.expectEmit(true, true, false, true);
        emit PayoutAnchor.RunCommitted(runId, payerA, ROOT, 3);
        vm.prank(payerA);
        anchor.commit(CLIENT_RUN, ROOT, 3);
    }
}
