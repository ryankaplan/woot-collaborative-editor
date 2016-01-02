var path = require('path');

desc('This is the default task.');
task('default', function (params) {
  console.log('This is the default task.');
});

desc('Compile client and server');
task('build', [], function () {

  var buildClient = function (done) {
    jake.exec(
      'tsc -p src/client',
      { printStdout: true },
      done
    );
  };

  var buildServer = function (done) {
    jake.exec(
      'tsc -p src/server',
      { printStdout: true },
      done
    );
  };

  buildServer(buildClient(complete));
});