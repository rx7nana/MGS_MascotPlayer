class Bytes extends Uint8Array {
  toString(encoding = "utf8") {
    return new TextDecoder(encoding === "ascii" ? "windows-1252" : encoding).decode(this);
  }
  readUInt16LE(offset) {
    return this[offset] | this[offset + 1] << 8;
  }
}
const decode64 = (text) => Bytes.from(atob(text), (character) => character.charCodeAt(0));
export {
  Bytes,
  decode64
};
