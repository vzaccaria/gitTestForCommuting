#!/usr/bin/env node
let $s = require("shelljs");
let $m = require("moment");
let _ = require("lodash");
let Promise = require("bluebird");
const prog = require("caporal");
const path = require("path");
const ora = require("ora");
const debug = require("debug")("gitTest");
const process = require("process");

let execP = command => {
  return new Promise((resolve, reject) => {
    require("child_process").exec(command, (error, stdout, stderr) => {
      debug({ error, stdout, stderr });
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ error, stdout, stderr });
      }
    });
  });
};

function downSyncDirectory(d, options) {
  let spinner = ora(`${d} - Checking`).start();
  let command = `cd ${d} && git status`;
  return execP(command).then(
    ({ stdout }) => {
      let toCommit = new RegExp("Changes not staged for commit");
      let commitAhead = new RegExp("Your branch is ahead");
      let untrackedFiles = new RegExp("untracked files present");
      if (toCommit.test(stdout) || untrackedFiles.test(stdout)) {
        spinner.fail(`${d} - Not clean.`);
      } else {
        if (commitAhead.test(stdout)) {
          spinner.fail(`${d} - Changes to be pushed`);
        } else {
          let cmd1 = `cd ${d} && git fetch`;
          spinner.succeed(`${d} - Ready to fetch`);
          let pspinner = ora(
            `${d} - Fetching (and optionally pulling)`
          ).start();
          return execP(cmd1).then(
            () => {
              if (options.pull) {
                let cmd2 = `cd ${d} && git pull`;
                return execP(cmd2).then(
                  () => pspinner.succeed(`${d} - Correctly pulled`),
                  () => pspinner.fail(`${d} - Can't pull`)
                );
              } else {
                pspinner.succeed(`${d} - Correctly fetched`);
              }
            },
            ({ stderr }) => {
              pspinner.fail(`${d} - Can't fetch, got error ${stderr}`);
            }
          );
        }
      }
    },
    () => {
      spinner.info(`${d} - Skipped as probably not a git repo`);
    }
  );
}

function upSyncDirectory(d, options) {
  let spinner = ora(`${d} - Checking`).start();
  let command = `cd ${d} && git status`;
  return execP(command).then(
    ({ stdout }) => {
      let isClean = new RegExp("nothing to commit");
      let toCommit = new RegExp("Changes not staged for commit");
      let commitAhead = new RegExp("Your branch is ahead");
      let untrackedFiles = new RegExp("untracked files present");
      if (toCommit.test(stdout) || untrackedFiles.test(stdout)) {
        spinner.fail(`${d} - Not clean.`);
      } else {
        if (commitAhead.test(stdout)) {
          if (options.push) {
            spinner.info(`${d} - Forcing push`);
            let pspinner = ora(`${d} - Pushing`).start();
            let cmd1 = `cd ${d} && git push`;
            return execP(cmd1).then(
              () => {
                pspinner.succeed(`${d} - Correctly pushed`);
              },
              ({ stderr }) => {
                pspinner.fail(`${d} - Can't push, got error ${stderr}`);
              }
            );
          } else {
            spinner.warn(`${d} - Some commits should be pushed into remote`);
          }
        } else {
          if (isClean.test(stdout)) {
            spinner.succeed(`${d}`);
          } else {
            spinner.info(`${d} - Unknown result - ${stdout}`);
          }
        }
      }
    },
    () => {
      spinner.info(`${d} - Skipped as probably not a git repo`);
    }
  );
}

function getDirectories(target, options) {
  let files = $s.ls("-dl", `${target}/*`);
  let directories = _.filter(files, f => f.isDirectory());
  if (options.depth1) {
    directories = _.flatMap(directories, d => {
      let fl = $s.ls("-dl", `${d.name}/*`);
      return _.filter(fl, f => f.isDirectory());
    });
  }
  return directories;
}

function upsync(target, options) {
  if (!path.isAbsolute(target)) {
    target = path.resolve(process.cwd(), target);
  }
  if (!options.exact) {
    let directories = getDirectories(target, options);
    if (options.from > 0) {
      directories = _.filter(directories, f => {
        let ref = $m().subtract(options.from, "day");
        if ($m(f.mtime).isAfter(ref)) {
          return true;
        } else {
          return false;
        }
      });
    }
    return Promise.all(
      _.map(directories, d => {
        upSyncDirectory(d.name, options);
      })
    );
  } else {
    return upSyncDirectory(target, options);
  }
}

function downsync(target, options) {
  if (!path.isAbsolute(target)) {
    target = path.resolve(process.cwd(), target);
  }
  if (!options.exact) {
    let directories = getDirectories(target, options);
    if (options.from > 0) {
      directories = _.filter(directories, f => {
        let ref = $m().subtract(options.from, "day");
        if ($m(f.mtime).isAfter(ref)) {
          return true;
        } else {
          return false;
        }
      });
    }
    return Promise.all(
      _.map(directories, d => {
        downSyncDirectory(d.name, options);
      })
    );
  } else {
    return downSyncDirectory(target, options);
  }
}

function upSyncAll(target, options) {
  return Promise.all(
    _.map(target, t => {
      upsync(t, options);
    })
  );
}

function downSyncAll(target, options) {
  return Promise.all(
    _.map(target, t => {
      downsync(t, options);
    })
  );
}

function callUpDownSync(dir, { file }) {
  if (!path.isAbsolute(file)) {
    file = path.resolve(process.cwd(), file);
    let dta = require(file);
    return Promise.all(
      _.map(dta, d => {
        d.from = _.get(d, "from", 10);
        d.exact = _.get(d, "exact", false);
        if (dir === "upsync") {
          upSyncAll(d.target, d.options);
        } else {
          downSyncAll(d.target, d.options);
        }
      })
    );
  }
}

prog
  .version("1.0.0")
  .description("Verifies git status of a target directory")
  .command(
    "upsync",
    "Checks for any uncommitted changes. Can push towards origin."
  )
  .argument("<target...>", "target directory")
  .option("--from <days>", "Look <days> behind (0 = all)", prog.INT, 10)
  .option("--push", "Force push of branches that are ahead")
  .option("--exact", "Targets are already git level repos")
  .option("--depth1", "Look into subdirectories")
  .action(function({ target }, options) {
    upSyncAll(target, options);
  })
  .command("downsync", "Fetches and optionally pulls from origin.")
  .argument("<target...>", "target directory")
  .option("--from <days>", "Look <days> behind (0 = all)", prog.INT, 10)
  .option("--pull", "Force pull of branches that are ahead")
  .option("--exact", "Targets are already git level repos")
  .option("--depth1", "Look into subdirectories")
  .action(function({ target }, options) {
    downSyncAll(target, options);
  })
  .command("fup", "As upsync but requires a json configuration file.")
  .argument("<file>", "configuration file")
  .action(_.curry(callUpDownSync)("upsync"))
  .command("fdown", "As downsync but requires a json configuration file.")
  .argument("<file>", "configuration file")
  .action(_.curry(callUpDownSync)("downsync"));

prog.parse(process.argv);
