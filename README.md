# @vue/conventional-changelog

Custom preset for [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog/).

```bash
yarn add -D @vue/conventional-changelog
```

Example usage:

```js
const execa = require('execa')
const cc = require('conventional-changelog')
const config = require('@vue/conventional-changelog')

const gen = module.exports = version => {
  const fileStream = require('fs').createWriteStream(`CHANGELOG.md`)

  cc({
    config,
    releaseCount: 0,
    pkg: {
      transform (pkg) {
        pkg.version = `v${version}`
        return pkg
      }
    }
  }).pipe(fileStream).on('close', async () => {
    delete process.env.PREFIX
    await execa('git', ['add', '-A'], { stdio: 'inherit' })
    await execa('git', ['commit', '-m', `chore: ${version} changelog [ci skip]`], { stdio: 'inherit' })
  })
}

if (process.argv[2] === 'run') {
  const version = require('../lerna.json').version
  gen(version)
}
```

[Result example](https://gist.github.com/Akryum/3cc2e3afaf5f7e730a3b9648b7ce4133)
