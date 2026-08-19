/**
 * rational.ts — 정확한 유리수 산술.
 *
 * 왜 필요한가: 생산 비율은 2/3, 1/7 같은 값이 누적된다. 부동소수점으로 누적하면
 * "제련기 23.999999대" 같은 값이 나오고, ceil이 경계에서 틀린다.
 * 표시 직전까지 유리수로 들고 간다. 결정 근거: docs/adr/0013-production-solver.md
 */

export interface Rational {
  readonly n: bigint; // 분자 (부호를 가진다)
  readonly d: bigint; // 분모 (항상 양수)
}

const abs = (x: bigint): bigint => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

export function make(n: bigint, d: bigint): Rational {
  if (d === 0n) throw new Error('분모가 0인 유리수');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

export const ZERO: Rational = { n: 0n, d: 1n };
export const ONE: Rational = { n: 1n, d: 1n };

/**
 * 소수를 유리수로.
 *
 * 고정 배율(예: ×1e6)로 양자화하면 스케일 곱셈이 누적될 때 오차가 남는다.
 * 실제로 "철광석 60/분"이 60.000004가 되어 채굴기가 2대로 표시되는 버그가 났다.
 * 그래서 10진 표기(유효숫자 15자리)를 그대로 분수로 옮긴다.
 */
export function fromNumber(x: number): Rational {
  if (!Number.isFinite(x)) throw new Error('유한하지 않은 수: ' + x);
  if (Number.isInteger(x)) return { n: BigInt(x), d: 1n };

  // toPrecision(15)는 부동소수점 표현 오차(0.1+0.2=0.30000000000000004)를 흡수한다.
  let s = x.toPrecision(15);
  if (s.includes('e') || s.includes('E')) s = x.toFixed(20);

  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const [intPart, fracRaw = ''] = s.split('.');
  const frac = fracRaw.replace(/0+$/, '');
  const digits = BigInt((intPart || '0') + frac);
  const denom = 10n ** BigInt(frac.length);
  return make(neg ? -digits : digits, denom);
}

export const add = (a: Rational, b: Rational): Rational => make(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational): Rational => make(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational): Rational => make(a.n * b.n, a.d * b.d);
export const div = (a: Rational, b: Rational): Rational => {
  if (b.n === 0n) throw new Error('0으로 나눔');
  return make(a.n * b.d, a.d * b.n);
};

export const isZero = (a: Rational): boolean => a.n === 0n;
export const cmp = (a: Rational, b: Rational): number => {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
};

export const toNumber = (a: Rational): number => Number(a.n) / Number(a.d);

/** 올림 — 기계 대수는 정수여야 한다. 유리수이므로 엡실론이 필요 없다. */
export function ceil(a: Rational): number {
  const q = a.n / a.d;
  const r = a.n % a.d;
  return Number(r > 0n ? q + 1n : q);
}

/** 표시용 반올림. maxDecimals 자리까지, 뒤따르는 0은 버린다. */
export function format(a: Rational, maxDecimals = 3): string {
  const neg = a.n < 0n;
  const n = abs(a.n);
  const whole = n / a.d;
  let rem = n % a.d;
  if (rem === 0n) return (neg ? '-' : '') + whole.toString();

  let out = '';
  for (let i = 0; i < maxDecimals && rem !== 0n; i++) {
    rem *= 10n;
    out += (rem / a.d).toString();
    rem %= a.d;
  }
  // 마지막 자리 반올림
  if (rem !== 0n && rem * 2n >= a.d && out.length === maxDecimals) {
    const bumped = (BigInt(out) + 1n).toString().padStart(out.length, '0');
    if (bumped.length > out.length) return (neg ? '-' : '') + (whole + 1n).toString();
    out = bumped;
  }
  out = out.replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (out ? '.' + out : '');
}

/**
 * 부동소수점 값의 올림. 계산 누적 오차로 60.0000000001 이 2대가 되는 사고를 막는다.
 * (CLAUDE.md 코딩 규약: 부동소수점 비교는 엡실론을 쓴다)
 */
export const ceilNum = (x: number, eps = 1e-6): number => Math.ceil(x - eps);
