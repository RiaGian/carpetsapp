const { app, BrowserWindow, protocol } = require('electron')
const path = require('path')
const fs = require('fs')

// origin/CORS/fetch
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

// create the main window of the app 
function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Carpets Desktop',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  //  app://PATH  --> dist/PATH (static αρχεία του build)
  protocol.registerFileProtocol('app', (request, callback) => {
    try {
      const url = new URL(request.url)                
      let reqPath = decodeURIComponent(url.pathname)   

      // root -> index.html
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html'

      const distDir = path.join(__dirname, '..', 'dist')
      const resolved = path.normalize(path.join(distDir, reqPath))

      if (!resolved.startsWith(distDir)) {
        return callback({ error: -6 }) // ERR_FILE_NOT_FOUND
      }

      if (!fs.existsSync(resolved)) {
        return callback({ error: -6 })
      }

      callback({ path: resolved })
    } catch (e) {
      console.error('app:// handler error', e)
      callback({ error: -2 }) // ERR_FAILED
    }
  })


  win.loadURL('app://index.html')
}

app.whenReady().then(createMainWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow() })
