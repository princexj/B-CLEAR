const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const path = require('path')

let backendProcess = null
let mainWindow = null

const rootDir = path.resolve(__dirname, '..')
const backendDir = path.join(rootDir, 'backend')
const frontendIndex = path.join(rootDir, 'frontend', 'dist', 'index.html')

function pythonCandidates() {
  const winCandidates = [
    path.join(backendDir, '.venv', 'Scripts', 'python.exe'),
    path.join(rootDir, 'venv', 'Scripts', 'python.exe'),
    path.join(rootDir, 'backend', 'venv', 'Scripts', 'python.exe'),
    'python',
    'py'
  ]
  const unixCandidates = [
    path.join(backendDir, '.venv', 'bin', 'python'),
    path.join(rootDir, 'venv', 'bin', 'python'),
    'python3',
    'python'
  ]
  return process.platform === 'win32' ? winCandidates : unixCandidates
}

function commandExists(command) {
  if (path.isAbsolute(command)) return fs.existsSync(command)
  return true
}

function startBackend() {
  const python = pythonCandidates().find(commandExists)
  if (!python) {
    throw new Error('Python was not found. Run npm run setup:backend first.')
  }

  const userEnvPath = path.join(app.getPath('userData'), '.env')
  const extraEnv = {}
  if (fs.existsSync(userEnvPath)) {
    const lines = fs.readFileSync(userEnvPath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const [key, ...valueParts] = trimmed.split('=')
      extraEnv[key.trim()] = valueParts.join('=').trim()
    }
  }

  const args = python.endsWith('py') ? ['-3', '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8001'] : ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8001']
  backendProcess = spawn(python, args, {
    cwd: backendDir,
    env: { ...process.env, ...extraEnv, PYTHONUNBUFFERED: '1' },
    windowsHide: true
  })

  backendProcess.on('error', (error) => {
    dialog.showErrorBox('B-CLEAR backend failed', error.message)
  })
}

function waitForBackend(timeoutMs = 20000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get('http://127.0.0.1:8001/', (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error('Backend did not start on http://127.0.0.1:8001.'))
          return
        }
        setTimeout(check, 500)
      })
      req.setTimeout(800, () => req.destroy())
    }
    check()
  })
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0d0d0f',
    title: 'B-CLEAR',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (!fs.existsSync(frontendIndex)) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'B-CLEAR build missing',
      message: 'frontend/dist was not found.',
      detail: 'Run npm run build before opening the desktop app.'
    })
    app.quit()
    return
  }

  await mainWindow.loadFile(frontendIndex)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(async () => {
  try {
    startBackend()
    await waitForBackend()
    await createWindow()
  } catch (error) {
    dialog.showErrorBox('B-CLEAR could not start', error.message)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill()
  }
})
