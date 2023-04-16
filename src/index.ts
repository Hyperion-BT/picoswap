import { bytesToHex } from "@hyperionbt/helios";
import { Program } from "./contract";

const program = new Program();

const uplcProgram = program.compile(true);

console.log("uplcProgram :>> ", bytesToHex(uplcProgram.toCbor()));
