// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayoutAnchor} from "../src/PayoutAnchor.sol";

/// @dev Reads vectors produced by the TypeScript Merkle implementation and
///      verifies them on chain. If these two ever disagree, real payouts would
///      anchor roots whose proofs nobody can verify.
contract MerkleCrossCheckTest is Test {
    PayoutAnchor anchor;
    address payer = address(0xA11CE);

    function setUp() public {
        anchor = new PayoutAnchor();
    }

    function test_typescriptProofsVerifyOnChain() public {
        string memory json = vm.readFile("../packages/core/test/fixtures/merkle-vectors.json");

        bytes32 root = vm.parseJsonBytes32(json, ".root");
        bytes32[] memory leaves = vm.parseJsonBytes32Array(json, ".leaves");

        vm.prank(payer);
        anchor.commit(keccak256("RUN"), root, uint32(leaves.length));
        bytes32 runId = anchor.runIdFor(payer, keccak256("RUN"));

        for (uint256 i = 0; i < leaves.length; i++) {
            bytes32[] memory proof = vm.parseJsonBytes32Array(
                json, string.concat(".proofs[", vm.toString(i), "]")
            );
            assertTrue(anchor.verifyItem(runId, leaves[i], proof), "proof failed");
        }
    }

    function test_forgedLeafIsRejected() public {
        string memory json = vm.readFile("../packages/core/test/fixtures/merkle-vectors.json");
        bytes32 root = vm.parseJsonBytes32(json, ".root");

        vm.prank(payer);
        anchor.commit(keccak256("RUN"), root, 3);
        bytes32 runId = anchor.runIdFor(payer, keccak256("RUN"));

        bytes32[] memory proof = vm.parseJsonBytes32Array(json, ".proofs[0]");
        assertFalse(anchor.verifyItem(runId, keccak256("not-in-tree"), proof));
    }
}
