#!/usr/bin/env node
let $s = require("shelljs");
let $m = require("moment");
let _ = require("lodash");

function main() {
  let files = $s.ls("-dl", "*");
  let directories = _.filter(files, f => f.isDirectory());
  directories = _.filter(directories, f => {
    let ref = $m().subtract(10, "day");
    let ft = $m(f.mtime);
    if ($m(f.mtime).isAfter(ref)) {
      return true;
    } else {
      return false;
    }
  });
  _.map(directories, d => {
    console.log(`\n\n\nDirectory: ${d.name} `);
    console.log(`---`);
    $s.exec(`echo "Evaluating ${d.name}" && cd ${d.name} && git status`);
  });
}

main();
