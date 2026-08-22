/**
 * 런타임 모듈 그래프의 아일랜드 경계를 검증한다.
 * .astro 파일은 Astro check가 맡고, 여기서는 정적 TS/TSX import만 검사한다.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: '런타임 모듈 순환은 초기화 순서와 번들 경계를 불명확하게 만든다.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: '해석할 수 없는 import는 빌드 환경에 따라 조용히 달라지면 안 된다.',
      from: {},
      to: { couldNotResolve: true, pathNot: '\\.css$' },
    },
    {
      name: 'lib-not-to-ui',
      severity: 'error',
      comment: '순수 로직은 DOM과 화면 모듈을 몰라야 한다.',
      from: { path: '^src/lib/' },
      to: { path: '^src/(components|pages)/' },
    },
    {
      name: 'domain-not-to-ui',
      severity: 'error',
      comment: '도메인 정본은 화면 계층에 의존하지 않는다.',
      from: { path: '^src/domain/' },
      to: { path: '^src/(components|pages)/' },
    },
    {
      name: 'state-not-to-generated-game-data',
      severity: 'error',
      comment: '사용자 상태 계층은 생성된 게임 데이터와 분리한다.',
      from: { path: '^src/state/' },
      to: { path: '^src/data/' },
    },
    {
      name: 'production-not-to-tooling',
      severity: 'error',
      comment: '제품 런타임은 테스트·생성 스크립트·레거시·문서 볼트에서 코드를 가져오지 않는다.',
      from: { path: '^src/' },
      to: { path: '^(tests|scripts|legacy|satisfactory-ops-vault|\\.tmp-research)/' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
      dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg'],
    },
    exclude: '(^|/)(dist|\\.cache|\\.astro|\\.tmp-research|legacy|satisfactory-ops-vault)(/|$)',
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
