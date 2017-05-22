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

function checkDirectory(d, options) {
  let spinner = ora(`${d} - Checking`).start();
  let command = `cd ${d} && git status`;
  return execP(command).then(({ stdout }) => {
    let isClean = new RegExp("nothing to commit, working directory clean");
    let toCommit = new RegExp("Changes not staged for commit");
    let commitAhead = new RegExp("Your branch is ahead");

    if (toCommit.test(stdout)) {
      spinner.fail(`${d} - Not clean.`);
    } else {
      if (commitAhead.test(stdout)) {
        if (options.push) {
          spinner.info(`${d} - Forcing push`);
          let cmd1 = `cd ${d} && git push`;
          return execP(cmd1).then(
            () => {
              spinner.succeed(`${d} - Correctly pushed`);
            },
            ({ stderr }) => {
              spinner.fail(`${d} - Got error ${stderr}`);
            }
          );
        } else {
          spinner.warn(`${d} - Some commits should be pushed into remote`);
        }
      } else {
        if (isClean.test(stdout)) {
          spinner.succeed(`${d} - Clean, nothing to commit`);
        } else {
          spinner.info(`${d} - Unknown result`);
        }
      }
    }
  });
}

function main(target, options) {
  if (!path.isAbsolute(target)) {
    target = path.resolve(process.cwd(), target);
  }
  let files = $s.ls("-dl", `${target}/*`);
  let directories = _.filter(files, f => f.isDirectory());
  directories = _.filter(directories, f => {
    let ref = $m().subtract(options.from, "day");
    let ft = $m(f.mtime);
    if ($m(f.mtime).isAfter(ref)) {
      return true;
    } else {
      return false;
    }
  });
  Promise.all(
    _.map(directories, d => {
      checkDirectory(d.name, options);
    })
  );
}

prog
  .version("1.0.0")
  .description("Verifies git status of a target directory")
  .argument("<target...>", "target directory")
  .option("--from <days>", "Look <days> behind", prog.INT, 10)
  .option("--push", "Force push of branches that are ahead")
  .action(function({ target }, options) {
    Promise.all(
      _.map(target, t => {
        main(t, options);
      })
    );
  });

prog.parse(process.argv);
