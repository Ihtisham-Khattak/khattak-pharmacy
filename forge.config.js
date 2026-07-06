const fs = require('fs');
const path = require('path');
const glob = require('glob');
const pkg = require("./package.json");

module.exports = {
  packagerConfig: {
    icon: 'assets/images/icon.ico', // Windows icon
    asar: true,
    ignore: [
      'gulpfile\\.js',
      '\\.git.*',
      'TODO',
      'notes\\.txt',
      'forge\\.config\\.js',
      'tests',
      'jest\\.config\\.js',
    ],
  },
  rebuildConfig: {},
  makers: [
    // Generic zip archive
    { name: '@electron-forge/maker-zip' },

  // Windows
  //
  // Code signing: to sign the generated Squirrel installer, set the
  // CSC_LINK (path to a base64-decoded .pfx certificate file) and
  // CSC_KEY_PASSWORD (its password) environment variables when running
  // `electron-forge make`/`publish` - these are wired through from the
  // CSC_LINK / CSC_KEY_PASSWORD GitHub Actions secrets in the build/release
  // workflows. When unset, certificateFile/certificatePassword resolve to
  // undefined and maker-squirrel skips signing gracefully, producing an
  // UNSIGNED installer (expected SmartScreen warnings for users) until a
  // real certificate is configured.
  {
    name: '@electron-forge/maker-squirrel',
    config: {
      certificateFile: process.env.CSC_LINK || undefined,
      certificatePassword: process.env.CSC_KEY_PASSWORD || undefined,
    },
  },
  { name: '@electron-forge/maker-wix', config: { language: 1033, manufacturer: pkg.author} },
  // { name: '@electron-forge/maker-appx', config: {} },

  // Linux
  { name: '@electron-forge/maker-deb', config: {} },
  { name: '@electron-forge/maker-rpm', config: {} },
  // { name: '@electron-forge/maker-snap', config: {} },

  // macOS
  { name: '@electron-forge/maker-dmg', config: { format: 'ULFO' } },
  // { name: '@electron-forge/maker-pkg', config: {} }
  ],

  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'drkNsubuga',
          name: 'PharmaSpot',
          draft: true,
        },
      },
    },
  ],

  // Fix issue with packaging Linux apps (node_gyp_bins)
  hooks: {
    packageAfterPrune(config, buildPath) {
      if (process.platform === 'linux') {
        const dirs = glob.sync(
          path.join(buildPath, 'node_modules/**/node_gyp_bins'),
          {
            onlyDirectories: true,
          }
        );

        for (const directory of dirs) {
          fs.rmdirSync(directory, { recursive: true, force: true });
        }
      }
    },
  },
};
