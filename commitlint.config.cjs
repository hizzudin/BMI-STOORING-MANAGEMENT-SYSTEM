/**
 * Conventional Commits enforced across the BMI Stooring System monorepo.
 * Commit discipline (CLAUDE.md / tasks.md): messages reference the TASK + REQ IDs,
 * e.g.  feat(wo): lifecycle + assignment engine [TASK-108]
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'chore',
        'docs',
        'test',
        'perf',
        'ci',
        'build',
        'refactor',
        'revert',
        'style',
      ],
    ],
    'subject-case': [0],
    'header-max-length': [2, 'always', 120],
  },
};
