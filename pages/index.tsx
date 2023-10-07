import React from "react";
import PicoValidator from "../contract/pico/main.hl";
import { bytesToHex } from "@hyperionbt/helios";
import Footer from "../components/footer";
import Header from "../components/header";
import Body from "../components/body";

export default function Page() {
  const program = new PicoValidator();

  const uplcProgram = program.compile(true);

  console.log("uplcProgram :>> ", bytesToHex(uplcProgram.toCbor()));

  return (
    <>
      <Header />
      {/* <Body /> */}
      <Footer />
    </>
  );
}
