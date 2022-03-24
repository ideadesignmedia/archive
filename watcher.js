const chokidar = require('chokidar')
const p = require('path')
const fs = require('fs')
const { saveError = e => console.log(e) } = global
class watcher {
    constructor(paths, FileEvent) {
        console.log('Intiating watch folders')
        let time = new Date().getTime()
        this.folders = []
        this.files = []
        this.removedFiles = []
        this.removedFolders = []
        this.FEVENT = []
        this.FileTimer
        this.init = process.env.INITWATCH === 'True' ? true : false
        this.FileEvent = FileEvent
        this.watch = chokidar.watch(paths, { ignored: [/[\/\\]\./, /^null$/, /.*\.lock$/, /.*node_modules/], persistent: true, usePolling: true, interval: 1000, binaryInterval: 3000, alwaysStat: true, awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 1500 }, ignorePermissionErrors: false, atomic: 800 })
        this.watch.on('add', (path, stats) => this.addFile(path, stats))
            .on('addDir', (path, stats) => this.addDir(path, stats))
            .on('change', (path, stats) => this.changeFile(path, stats))
            .on('unlink', (path) => this.unlinkFile(path))
            .on('unlinkDir', (path) => this.unlinkDir(path))
            .on('error', e => this.fileError(e))
            .on('ready', () => {
                this.init = true
                let dif = new Date().getTime() - time
                console.log(`Initialized watch folders in: ${dif < 1000 ? `${dif}ms` : dif < 1000 * 60 ? `${dif / 1000}s` : dif < 1000 * 60 * 60 ? `${Math.floor(dif / (1000 * 60))} minutes ${dif % (1000 * 60) / 1000} seconds` : `${Math.floor((dif / 1000) * 60 * 60)} hours ${Math.floor(dif % (1000 * 60))} minutes`}. Watching changes.`);
                this.getFolders()
                this.runFile()
            })
    }
    addPath = path => this.watch.add(path);
    getFolders = () => {
        this.folders = this.watch.getWatched()
        let k = Object.keys(this.folders)
        this.files = []
        for (let i = 0; i < k.length; i++) {
            let w = this.folders[k[i]]
            for (let z = 0; z < w.length; z++) {
                let path = p.resolve(k[i], w[z])
                let file = fs.statSync(path)
                this.files.push({ path, stats: file })
            }
        }
        this.folders = k
        console.log('Watching', this.files.length, 'files')
    }
    addNewFile(file, isRename) { this.que('addFile', file, isRename) }
    addDirectory(file, isRename) { this.que('addDir', file, isRename) }
    onchangeFile(file, stats) { this.que('changeFile', file, stats) }
    unlinkFolder(path) { setTimeout(() => this.que('deleteDir', { path }), 2000) }
    unlink(path) { setTimeout(() => this.que('deleteFile', { path }), 2000) }
    async addFile(path, stats) {
        if (this.init) {
            this.files.push({ path, stats })
            let r = null
            let c = () => {
                for (let i = 0; i < this.removedFiles.length; i++) {
                    if (this.removedFiles[i].stats.size === stats.size && this.removedFiles[i].stats.birthtimeMs === stats.birthtimeMs && this.removedFiles[i].stats.dev === stats.dev && p.extname(path) === p.extname(this.removedFiles[i].path)) {
                        r = this.removedFiles.splice(i, 1)
                        i = Infinity
                    }
                }
            }
            await c()
            this.addNewFile({ path, stats }, r ? r[0] : false)
        }
    }
    async addDir(path, stats) {
        if (this.init) {
            this.folders.push(path)
            this.files.push({ path: path, stats: fs.statSync(path) })
            let r = null
            let c = () => {
                for (let i = 0; i < this.removedFolders.length; i++) {
                    if (this.removedFolders[i].stats.size === stats.size && this.removedFolders[i].stats.birthtimeMs === stats.birthtimeMs && this.removedFolders[i].stats.dev === stats.dev) {
                        r = this.removedFolders.splice(i, 1)
                        i = Infinity
                    }
                }
            }
            await c()
            this.addDirectory({ path, stats }, r ? r[0] : false)
        }
    }
    changeFile(path, stats) {
        if (this.init) this.onchangeFile({ path, stats })
    }
    unlinkFile(path) {
        if (this.init) {
            for (let i = 0; i < this.files.length; i++) {
                if (absolute(this.files[i].path) === absolute(path)) {
                    let r = this.files.splice(i, 1)[0]
                    if (r) this.removedFiles.push(r)
                    i = Infinity
                }
            }
            this.unlink(path)
        }
    }
    unlinkDir(path) {
        if (this.init) {
            let a = false
            for (let i = 0; i < this.files.length; i++) {
                if (this.files[i].path && path && absolute(this.files[i].path) === absolute(path)) {
                    let r = this.files.splice(i, 1)[0]
                    if (r) this.removedFolders.push(r)
                    a = true
                    i = Infinity
                }
            }
            for (let i = 0; i < this.folders.length; i++) {
                if (this.folders[i] && path && absolute(this.folders[i]) === absolute(path)) {
                    let r = this.folders.splice(i, 1)[0]
                    if (r && !this.removedFolders.find(u => u.path === r.path)) this.removedFolders.push(r)
                    i = Infinity
                }
            }
            this.unlinkFolder(path)
        }
    }
    que(type, u, a) {
        this.FEVENT.push([type, u, a])
    }
    fileError(error) {
        if (error.code === 'EBUSY') return
        if (error.code === 'UNKNOWN') return
        if (error.code === 'EBADF') return
        console.error('Error happened', error);
        if (this.error) this.error(error)
    }
    runFile() {
        clearTimeout(this.FileTimer)
        let set = () => this.FileTimer = setTimeout(() => this.runFile(), 100)
        if (this.FEVENT.length > 0) {
            let file = this.FEVENT.splice(0, 1)[0]
            if (file[0] === 'deleteFile' || file[0] === 'deleteDir') {
                let a = false
                if (file[0] === 'deleteFile') {
                    for (let i = 0; i < this.removedFiles.length; i++) {
                        let path = this.removedFiles[i].path
                        if (file[1].path === path) {
                            a = true
                            i = Infinity
                        }
                    }
                } else {
                    for (let i = 0; i < this.removedFolders.length; i++) {
                        let path = this.removedFolders[i].path
                        if (file[1].path === path) {
                            a = true
                            i = Infinity
                        }
                    }
                }
                if (!a) return this.runFile()
            }
            if (this.FileEvent && typeof this.FileEvent === 'function') {
                try {
                    this.FileEvent(file[0], file[1], file[2])
                } catch (e) {
                    saveError(e)
                }
                this.runFile()
            } else {
                saveError(`UNHANDLED FILE EVENT: ${JSON.stringify(file)}`)
                this.runFile()
            }
        } else {
            set()
        }
    }
}
module.exports = watcher