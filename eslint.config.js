import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/', 'vendor/', 'coverage/'] },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.browser, Chart: 'readonly' }
        }
    },
    {
        files: ['sw.js'],
        languageOptions: { sourceType: 'script', globals: globals.serviceworker }
    },
    {
        files: ['tests/**/*.js', '*.config.js'],
        languageOptions: { globals: globals.node }
    }
];
