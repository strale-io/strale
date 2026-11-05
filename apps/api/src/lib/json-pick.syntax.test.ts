/**
 * Review S4: malformed JSON is a SyntaxError wherever it appears (in a picked
 * member, in a skipped subtree, in a key), not only inside captured values.
 * The first cut let `{"a":1 "b":2}` pick `a` as 2.
 */
import { describe, expect, it } from "vitest";
import { JsonPicker, type Pick } from "./json-pick.js";

function pickWith(text: string, spec: Pick, chunk: number): unknown {
  const bytes = Buffer.from(text, "utf8");
  const picker = new JsonPicker(spec);
  for (let i = 0; i < bytes.length; i += chunk) picker.write(bytes.subarray(i, i + chunk));
  return picker.finish();
}

const pick: Pick = { a: true, keep: true };
const r = String.raw;

const bad: Array<[string, string]> = [
  ["a missing comma between members", r`{"a":1 "b":2}`],
  ["a missing colon", r`{"a" 1}`],
  ["an unquoted key", r`{a:1}`],
  ["a missing comma in an unpicked array", r`{"x":[1 2],"a":1}`],
  ["a truncated literal", r`{"x":tru,"a":1}`],
  ["a truncated literal at a closer", r`{"a":tru}`],
  ["an empty array element", r`{"x":[,],"a":1}`],
  ["a trailing comma in an object", r`{"a":1,}`],
  ["a trailing comma in an array", r`{"x":[1,],"a":1}`],
  ["a leading zero", r`{"x":01,"a":1}`],
  ["a leading zero in a picked value", r`{"a":01}`],
  ["a bare minus", r`{"x":-,"a":1}`],
  ["a fraction with no digits", r`{"x":1.,"a":1}`],
  ["trailing garbage after the root", r`{"a":1} x`],
  ["a second root", r`{"a":1}{"a":2}`],
  ["an invalid escape in an unpicked string", r`{"x":"\q","a":1}`],
  ["an invalid unicode escape", r`{"x":"\u12G4","a":1}`],
  ["a raw control character in an unpicked string", '{"x":"a\nb","a":1}'],
  ["a raw control character in a key", '{"x\ny":1,"a":1}'],
  ["a mismatched closer", r`{"x":[1},"a":1}`],
  ["an object closed with ]", r`{"a":1]`],
  ["a key with no value", r`{"a"}`],
  ["a missing value", r`{"a":}`],
  ["a doubled comma", r`{"a":1,,"b":2}`],
  ["a comma before the first member", r`{,"a":1}`],
  ["a root that is an array", r`[1 2]`],
];

describe("malformed JSON is a SyntaxError (review S4)", () => {
  for (const chunk of [1, 5, 1000]) {
    for (const [name, text] of bad) {
      it(`rejects ${name} (chunk ${chunk})`, () => {
        expect(() => pickWith(text, pick, chunk)).toThrow(SyntaxError);
      });
    }
  }

  it("the value after a missing comma is not silently taken", () => {
    expect(() => pickWith(r`{"a":1 "b":2}`, { a: true, b: true }, 64)).toThrow(SyntaxError);
  });

  it("still accepts the number and literal grammar and every escape", () => {
    const text = r`{"x":[-0,0.5,-12.5e+10,1E3,2e-2,true,false,null,"\" \\ \/ \b \f \n \r \t é"],"a":1}`;
    for (const chunk of [1, 3, 1000]) expect(pickWith(text, pick, chunk)).toEqual({ a: 1 });
  });
});
