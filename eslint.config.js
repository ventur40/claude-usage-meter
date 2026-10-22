import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                global: 'readonly',
                imports: 'readonly',
                print: 'readonly',
                TextDecoder: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
            'prefer-const': 'error',
            'eqeqeq': 'error',
            'indent': ['error', 4, {ignoredNodes: ['CallExpression > ClassExpression']}],
            'quotes': ['error', 'single', {avoidEscape: true}],
            'semi': ['error', 'always'],
            'comma-dangle': ['error', 'always-multiline'],
        },
    },
];
