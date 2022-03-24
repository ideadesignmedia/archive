const archiver = require('archiver')
const fs = require('fs')
const https = require('https')
const { URL } = require('url')
let zip = (input, outputPath, glob) => {
    return new Promise((res, rej) => {
        if (!input) return rej('Missing input')
        let output = fs.createWriteStream(outputPath)
        let archive = archiver('zip', { zlib: { level: 9 } })
        output.on('close', () => {
            return res(outputPath, archive.pointer())
        });
        output.on('end', () => {
            console.log('Data has been drained');
        });
        archive.on('warning', function (err) {
            if (err.code === 'ENOENT') {
                console.log(err)
            } else {
                rej(err)
            }
        });
        archive.on('error', err => rej(err));
        archive.pipe(output);
        if (glob) {
            archive.glob(input, { cwd: process.cwd(), ...glob })
        } else {
            archive.directory(input, false)
        }
        archive.finalize()
    })
}
let sendBuild = (build, url, headers) => {
    return new Promise((res, rej) => {
        if (!fs.existsSync(build)) return rej('Unable to locate build')
        let { size } = fs.statSync(build)
        let parsed = new URL(url)
        let request = https.request({ host: parsed.hostname, path: parsed.pathname, method: 'post', headers: { ...headers, 'Content-Type': `application/x-zip`, 'Content-Length': size } }, resp => {
            let string = ''
            resp.on('error', e => rej(e))
            resp.on('abort', e => rej(e))
            resp.on('data', d => string += d)
            resp.on('end', () => {
                let data
                try {
                    data = JSON.parse(string)
                } catch (e) {
                    return rej(e)
                }
                if (data.error) return rej(data.message || string)
                return res(data)
            })
        })
        request.on('error', e => rej(e))
        request.on('abort', e => rej(e))
        request.pipe(fs.createReadStream(build))
    })
}
const handleArchive = (workingPath, archivePath, options, upload) => {
    zip('*', archivePath || 'build.zip', { ignore: ['node_modules', 'database', 'config.json'], cwd: workingPath, ...options }).then(build => {
        if (upload) sendBuild(build, upload.url, upload.headers || {}).then(() => {
            if (upload.remove) fs.unlink(build, err => {
                if (err) console.log(err)
            })
        }).catch(e => {console.log(`Failed to upload build: ${JSON.stringify(e)}`); fs.unlinkSync('./deploy.zip')})
    }).catch(e => console.log(`Failed to zip build folder: ${JSON.stringify(e)}`))
}
var lastChange
const triggerArchive = (workingPath, archivePath, options) => {
    clearTimeout(lastChange)
    lastChange = setTimeout(() => handleArchive(workingPath, archivePath, options), 3000)
}
const watcher = require('./watcher.js')
const watches = require('./watches.json')
watches.forEach(({ workingPath, archivePath, options = {}, upload }) => new watcher(workingPath, () => triggerArchive(workingPath, archivePath, options, upload)))