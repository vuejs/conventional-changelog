'use strict'

const compareFunc = require(`compare-func`)
const Q = require(`q`)
const readFile = Q.denodeify(require(`fs`).readFile)
const { resolve } = require(`path`)
const execa = require('execa')

const packageRe = /(packages\/@vue\/([a-z0-9-]+))|(docs)\//i

module.exports = Q.all([
  readFile(resolve(__dirname, `./templates/template.hbs`), `utf-8`),
  readFile(resolve(__dirname, `./templates/header.hbs`), `utf-8`),
  readFile(resolve(__dirname, `./templates/commit.hbs`), `utf-8`),
  readFile(resolve(__dirname, `./templates/footer.hbs`), `utf-8`)
])
  .spread((template, header, commit, footer) => {
    const writerOpts = getWriterOpts()

    writerOpts.mainTemplate = template
    writerOpts.headerPartial = header
    writerOpts.commitPartial = commit
    writerOpts.footerPartial = footer

    return writerOpts
  })

function getWriterOpts () {
  return {
    transform: (commit, context) => {
      let discard = true
      const issues = []

      commit.notes.forEach(note => {
        note.title = `BREAKING CHANGES`
        discard = false
      })

      if (commit.type === `feat`) {
        commit.type = `Features`
      } else if (commit.type === `fix`) {
        commit.type = `Bug Fixes`
      } else if (commit.type === `perf`) {
        commit.type = `Performance Improvements`
      } else if (commit.type === `revert`) {
        commit.type = `Reverts`
      } else if (discard) {
        return
      } else if (commit.type === `docs`) {
        commit.type = `Documentation`
      } else if (commit.type === `style`) {
        commit.type = `Styles`
      } else if (commit.type === `refactor`) {
        commit.type = `Code Refactoring`
      } else if (commit.type === `test`) {
        commit.type = `Tests`
      } else if (commit.type === `build`) {
        commit.type = `Build System`
      } else if (commit.type === `ci`) {
        commit.type = `Continuous Integration`
      }

      if (commit.scope === `*`) {
        commit.scope = ``
      }

      if (typeof commit.hash === `string`) {
        commit.hash = commit.hash.substring(0, 7)
      }

      if (typeof commit.subject === `string`) {
        let url = context.repository
          ? `${context.host}/${context.owner}/${context.repository}`
          : context.repoUrl
        if (url) {
          url = `${url}/issues/`
          // Issue URLs.
          commit.subject = commit.subject.replace(/#([0-9]+)/g, (_, issue) => {
            issues.push(issue)
            return `[#${issue}](${url}${issue})`
          })
        }
        if (context.host) {
          // User URLs.
          commit.subject = commit.subject.replace(/\B@([a-z0-9](?:-?[a-z0-9]){0,38})/g, `[@$1](${context.host}/$1)`)
        }
      }

      // remove references that already appear in the subject
      commit.references = commit.references.filter(reference => {
        if (issues.indexOf(reference.issue) === -1) {
          return true
        }

        return false
      })

      const { stdout: files } = execa.sync('git', [
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        commit.hash
      ])
      commit.files = files.split('\n')

      const scores = {}
      for (const file of commit.files) {
        const result = packageRe.exec(file)
        let id = 'other'
        if (result) {
          id = result[2] || result[3]
        }
        if (!scores[id]) scores[id] = 0
        scores[id]++
      }
      let choice = null
      for (const id in scores) {
        if (!choice || scores[id] > scores[choice]) {
          choice = id
        }
      }
      commit.package = choice

      return commit
    },
    groupBy: `type`,
    commitGroupsSort: `title`,
    commitsSort: [`scope`, `subject`],
    noteGroupsSort: `title`,
    notesSort: compareFunc,
    finalizeContext (context, writerOpts, filteredCommits, keyCommit) {
      // Tags & Compare
      const { gitSemverTags } = context
      if ((!context.currentTag || !context.previousTag) && keyCommit) {
        let match = /tag:\s*(.+?)[,)]/gi.exec(keyCommit.gitTags)
        let currentTag = context.currentTag
        context.currentTag = currentTag || match ? match[1] : null
        let index = gitSemverTags.indexOf(context.currentTag)

        if (index !== -1) {
          context.previousTag = gitSemverTags[index + 1]
        }
      } else {
        context.previousTag = context.previousTag || gitSemverTags[0]
      }

      if (typeof context.linkCompare !== 'boolean' && context.previousTag && context.currentTag) {
        context.linkCompare = true
      }

      // Commit groups
      const perTypes = context.commitGroups
      const packagesMap = {}
      for (const group of perTypes) {
        for (const commit of group.commits) {
          const pkg = packagesMap[commit.package] = packagesMap[commit.package] || {
            id: commit.package,
            groups: {}
          }
          const g = pkg.groups[group.title] = pkg.groups[group.title] || {
            title: group.title,
            commits: []
          }
          g.commits.push(commit)
        }
      }

      const finalGroups = []
      for (const n in packagesMap) {
        const pkg = packagesMap[n]
        pkg.groups = Object.keys(pkg.groups).reduce((list, key) => {
          list.push(pkg.groups[key])
          return list
        }, [])
        finalGroups.push(pkg)
      }
      finalGroups.sort((a, b) => a.id.localeCompare(b.id))
      context.commitGroups = finalGroups
      return context
    }
  }
}
