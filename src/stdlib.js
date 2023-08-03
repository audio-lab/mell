export const std = {
  // signed min/max
  "i32.smax": "(func $i32.smax (param i32 i32) (result i32) (select (local.get 0) (local.get 1) (i32.ge_s (local.get 0) (local.get 1))))",
  "i32.smin": "(func $i32.smin (param i32 i32) (result i32) (select (local.get 0) (local.get 1) (i32.le_s (local.get 0) (local.get 1))))",
  "i32.dup": "(func $i32.dup (param i32) (result i32) (local.get 0)(local.get 0))",

  // just for reference - easier to just `f64.ne` directly
  "f64.isnan": "(func $f64.isnan (param f64) (result i32) (f64.ne (local.get 0) (local.get 0)))",

  // Comppute 2^(a + b) where a ≥ b ≥ 0 or a ≤ b ≤ 0
  "f64.exp2": `
  static double exp2_(double a, double b)
  {
      const double ln2[] = { 0x1.62e42ffp-1, -0x1.718432a1b0e26p-35 };

      double s = a + b;

      if (s > 1024 || (s == 1024 && b > s - a))
          return HUGE_VAL;

      if (s < -1075 || (s == -1075 && b < s - a))
          return 0;

      double n = rint(s);
      double t = s - n;
      double t0 = truncate_(t, 32);
      double u = t0 * ln2[0];
      double v = t * ln2[1] + (a - (n + t0) + b) * ln2[0];
      int64_t i = reinterpret(int64_t, kernel_expb_(u, v) + 1) + ((int64_t)n << 52);

      if (s < -1020)
          return 0x1p-1020 * reinterpret(double, i + 0x3FC0000000000000);

      return reinterpret(double, i);
  }`,

  // a ** b generic case
  // ref: https://github.com/jdh8/metallic/blob/master/src/math/double/pow.c
  "f64.pow": `(func $f64.pow (param $x f64) (param $y f64) (result f64)
      (local $sign i64)
      (if (f64.eq (local.get $y) (f64.const 0)) (then (return (f64.const 1))))
      (if (i32.and (f64.lt (local.get $x) (f64.const 0)) (f64.eq (f64.nearest (local.get $y)) (local.get $y)) )
        (then
          (local.set $x (f64.neg (local.get $x)))
          (local.set $sign
            (i64.shl (i64.extend_i32_u (f64.ne (f64.nearest (f64.div (local.get $y) (f64.const 2))) (f64.div (local.get $y) (f64.const 2))) ) (i64.const 63))
          )
        )
      )
      (return (f64.const -1))

      ;; _unsigned
      ;; if (x == 1) unsigned_ = 1;
      ;; else if (x == 0) unsigned_ =  signbit(y) ? HUGE_VAL : 0;
      ;; else if (isinf(x)) unsigned_ =  signbit(y) ? 0 : HUGE_VAL;
      ;; else if (signbit(x)) unsigned_ =  NAN;
      ;; else if (isinf(y)) unsigned_ = signbit(y) ^ (x < 1) ? 0 : HUGE_VAL;
      ;; else {
      ;;   double t1;
      ;;   double t0 = log2_(normalize_(reinterpret(int64_t, x)), &t1);
      ;;   double y0 = truncate_(y, 32);
      ;;   unsigned_ =  exp2_(y0 * t0, (y - y0) * t0 + y * t1);
      ;; }
      ;; uint64_t magnitude = reinterpret(uint64_t, unsigned_);
      ;; return reinterpret(double, magnitude | sign);
  )`,

  // a %% b, also used to access buffer
  "i32.modwrap": `(func $i32.modwrap (param i32 i32) (result i32) (local $rem i32)\n` +
  `(local.set $rem (i32.rem_s (local.get 0) (local.get 1)))\n` +
  `(if (result i32) (i32.and (local.get $rem) (i32.const 0x80000000))\n` +
    `(then (i32.add (local.get 1) (local.get $rem))) (else (local.get $rem))\n` +
  `))`,

  // increase available memory to N bytes, grow if necessary; returns ptr to allocated block
  "malloc": `(func $malloc (param i32) (result i32) (local i32 i32)\n` +
    `(local.set 1 (global.get $__mem))\n` + // beginning of free memory
    `(global.set $__mem (i32.add (global.get $__mem) (local.get 0)))\n` + // move memory pointer
    `(local.set 2 (i32.shl (memory.size) (i32.const 16)) )\n` + // max available memory
    // 2^12 is how many f64 fits into 64Kb memory page
    `(if (i32.ge_u (global.get $__mem) (local.get 2)) (then\n` +
      // grow memory by the amount of pages needed to accomodate full data
      `(memory.grow (i32.add (i32.shr_u (i32.sub (global.get $__mem) (local.get 2))(i32.sub (i32.const 1)) (i32.const 16)) (i32.const 1)) )(drop)\n` +
    `))\n` +
    `(local.get 1)\n` +
  `)`,

  // fill mem area at offset with range values from, to via step param; returns ptr to last address
  "range":
  `(func $range (param i32 f64 f64 f64) (result i32)\n` +
    `(local.get 0)(local.get 1)(local.get 2)(local.get 3)\n` +
    `(if (param i32 f64 f64 f64) (result i32) (f64.gt (local.get 2)(local.get 1))\n` +
      `(then (call $range.asc))(else (call $range.dsc))\n` +
    `)` +
  `)\n` +
  `(func $range.asc (param i32 f64 f64 f64) (result i32)`  +
    `(loop ` +
      `(if (f64.lt (local.get 1)(local.get 2))` +
        `(then` +
          `(f64.store (local.get 0) (local.get 1))` +
          `(local.set 0 (i32.add (local.get 0) (i32.const 8)))` +
          `(local.set 1 (f64.add (local.get 1) (local.get 3)))` +
          `(br 1)` +
        `)` +
      `)` +
    `)` +
    `(local.get 0)` +
  `)\n` +
  `(func $range.dsc (param i32 f64 f64 f64) (result i32)`  +
    `(loop ` +
      `(if (f64.gt (local.get 1)(local.get 2))` +
        `(then` +
          `(f64.store (local.get 0) (local.get 1))` +
          `(local.set 0 (i32.add (local.get 0) (i32.const 8)))` +
          `(local.set 1 (f64.sub (local.get 1) (local.get 3)))` +
          `(br 1)` +
        `)` +
      `)` +
    `)` +
    `(local.get 0)` +
  `)`,

  // create reference to mem address (in bytes) with length (# of f64 items) - doesn't allocate memory, just creates ref
  "arr.ref":
  `(func $arr.ref (param i32 i32) (result f64)\n` +
    `(f64.reinterpret_i64 (i64.or\n` +
      // array address is int part of f64, safe up to i32 ints
      `(i64.reinterpret_f64 (f64.convert_i32_u (local.get 0)))\n` +
      // array length is last 24 bits of f64 - it doesn't affect address i32 part
      `(i64.extend_i32_u (i32.and (i32.const 0x00ffffff) (local.get 1)))` +
    `))\n` +
  `(return))`,

  // reads array address from ref (likely not needed to use since can be just converted float to int)
  "arr.adr": `(func $arr.adr (param f64) (result i32) (i32.trunc_f64_u (local.get 0)) (return))`,

  // reads array length as last 24 bits of f64 number
  "arr.len": `(func $arr.len (param f64) (result i32) (i32.wrap_i64 (i64.and (i64.const 0x0000000000ffffff) (i64.reinterpret_f64 (local.get 0)))))`,

  // arr.set(ref, pos, val): writes $val into array, $idx is position in array (not mem address). Returns array ref (for chaining).
  "arr.set": `(func $arr.set (param f64 i32 f64) (result f64)\n` +
    // wrap negative idx: if idx < 0 idx = idx %% ref[]
    `(if (i32.lt_s (local.get 1) (i32.const 0)) (then (local.set 1 (call $i32.modwrap (local.get 1) (call $arr.len (local.get 0))))))\n` +
    `(f64.store (i32.add (i32.trunc_f64_u (local.get 0)) (i32.shl (local.get 1) (i32.const 3))) (local.get 2))\n` +
    `(local.get 0)\n` +
  `(return))\n` +

  // same as arr.set, but returns assigned value
  `(func $arr.tee (param f64 i32 f64) (result f64) (call $arr.set (local.get 0)(local.get 1)(local.get 2))(drop) (return (local.get 2)))`,

  // arr.get(ref, pos): reads value at position from array
  "arr.get": `(func $arr.get (param f64 i32) (result f64)\n` +
    // wrap negative idx
    `(if (i32.lt_s (local.get 1) (i32.const 0)) (then (local.set 1 (call $i32.modwrap (local.get 1) (call $arr.len (local.get 0))))))\n` +
    `(f64.load (i32.add (i32.trunc_f64_u (local.get 0)) (i32.shl (local.get 1) (i32.const 3))))\n` +
  `)`,

  math: `(global pi f64 (f64.const 3.141592653589793))`
}


export default std