var path = require('path'),
    fs = require('fs'),
    log = require('./log'),
    config = require('./config'),
    globcp = require('./globcp'),
    shell = require('shelljs'),
    when = require('when'),
    sequence = require('when/sequence'),
    fn = require('when/node'),
    noop = when.resolve(true),
    tracker = require('./tracker');

function run(command, commandArgs) {

    var shellCommand = getShellCommand(command),
        cmd = [].slice.call(arguments).join(' '),
        args = [].slice.call(arguments, 1),
        silentState = shell.config.silent;

    shell.config.silent = !config.isVerbose();

    log.execution(cmd);

    if (config.isDryRun()) {
        return noop;
    }

    return when.promise(function(resolve, reject) {

        if(shellCommand === 'exec') {

            shell.exec(cmd, function(code, output) {
                if (code === 0) {
                    resolve({
                        code: code,
                        output: output
                    });
                } else {
                    reject(output);
                }
            });

        } else if(shellCommand) {

            resolve(shell[shellCommand].apply(shell, args));

        } else {

            resolve(command.apply(null, args));

        }

        shell.config.silent = silentState;

    });

}

function getShellCommand(command) {
    return command && command in shell && typeof shell[command] === 'function' ? command : 'exec';
}

function pushd(path) {
    return run('pushd', path);
}

function popd() {
    return run('popd');
}

function build(command, dir) {
    tracker._track('npm', 'run-script');
    return command ? sequence([
        run.bind(null, 'rm', '-rf', dir),
        run.bind(null, 'mkdir', '-p', dir),
        run.bind(null, command)
    ]) : noop.then(function() {
        log.verbose('No build command was provided.');
    });
}

function npmPublish(path) {
    tracker._track('npm', 'publish');
    var options = config.getOptions();
    return run('npm', 'publish', options.publishPath || path || '.');
}

function copy(files, options, target) {
    log.execution('copy', files, options, target);
    return !config.isDryRun() ? globcp(files, options, target) : noop;
}

function bump(file, version) {
    log.execution('bump', file, version);
    if (!config.isDryRun()) {
        var files = typeof file === 'string' ? [file] : file;
        return when.map(files, function(file) {
            return fn.call(fs.readFile, path.resolve(file)).then(function(data) {
                var pkg = JSON.parse(data.toString());
                pkg.version = version;
                return pkg;
            }, function(err) {
                log.warn('There was a problem reading ' + (err.path || file));
                log.debug(err);
            }).then(function(data) {
                if(data){
                    return fn.call(fs.writeFile, file, JSON.stringify(data, null, 2) + '\n');
                }
            }).catch(function(err) {
                log.warn('There was a problem bumping the version in ' + file);
                log.debug(err);
            });
        });
    } else {
        return noop;
    }
}

module.exports = {
    run: run,
    pushd: pushd,
    popd: popd,
    build: build,
    npmPublish: npmPublish,
    copy: copy,
    bump: bump
};