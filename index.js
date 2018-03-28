'use strict';
var fs = require('fs-extra');
var archiver = require('archiver');
var gitRoot = require('git-root');
var git = require('git-rev-sync');
var aws = require('aws-sdk');
var gutil = require('gulp-util');


var root = gitRoot();
if (!root)
  throw new Error("Cannot determine git root");
  
var name = JSON.parse(fs.readFileSync(root + '/package.json', 'utf8')).name;
var branch = git.branch();
var archiveName = name + "-" + branch + ".zip";
var archiveFolder = root + '/dist/';
var archivePath = archiveFolder +  archiveName;
var bucketName = "download.reportix.com";
var bucketRegion = "eu-west-1";
var remoteKey = 'cachePacks/' + archiveName;
var remoteKeyACL = "public-read";


exports.archive = function(done) {
  // create a file to stream archive data to.
  fs.ensureDirSync(archiveFolder);
  var output = fs.createWriteStream(archivePath);
  var archive = archiver('zip', { zlib: { level: 9 }  }); // Sets the compression level.

  // listen for all archive data to be written
  // 'close' event is fired only when a file descriptor is involved
  output.on('close', function() {
    console.log('Wrote ' + archivePath + ', ' + archive.pointer() + ' total bytes');
    done();
  });

  // good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on('warning', function(err) {
    // throw error
    throw err;
  });

  // good practice to catch this error explicitly
  archive.on('error', function(err) {
    throw err;
  });

  // pipe archive data to the file
  archive.pipe(output);

  // append files from a sub-directory, putting its contents at the root of archive
  archive.directory('root/', false);

  // finalize the archive (ie we are done appending files but streams have to finish yet)
  // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
  archive.finalize();  
}

exports.publish = function(done) {
  if (process.env.AWS_ACCESS_KEY_ID === undefined)
    throw new gutil.PluginError({ plugin: 'publish', message: 'AWS_ACCESS_KEY_ID not defined' });
  if (process.env.AWS_SECRET_ACCESS_KEY === undefined)
    throw new gutil.PluginError({ plugin: 'publish', message: 'AWS_SECRET_ACCESS_KEY not defined' });
  var s3Client = new aws.S3({
      region: bucketRegion,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  });
  var localFileContent = fs.readFileSync(archivePath);
  var url = 'https://s3.' + bucketRegion + '.amazonaws.com/' + bucketName + '/' + remoteKey;
  var params = {
    Bucket: bucketName,
    Key: remoteKey,
    Body: localFileContent,
    ACL: remoteKeyACL
  };
  s3Client.putObject(params, function(err, data) {
    if (err) {
      throw err;
    }
    console.log('File uploaded: ' + archiveName + ' -> ' + url);
    done();
  });
}
