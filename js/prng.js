// mulberry32 — tiny seeded PRNG, public domain. Identical streams across
// devices for the same 32-bit seed. The single source of randomness for
// gameplay; never use Math.random.
export function mulberry32(seed) {
  let s = seed >>> 0;
  function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  next.getState = () => s;
  next.setState = (val) => { s = val >>> 0; };
  return next;
}

export function pickIndex(rng, n) {
  return Math.floor(rng() * n);
}

export function pick(rng, list) {
  return list[pickIndex(rng, list.length)];
}
