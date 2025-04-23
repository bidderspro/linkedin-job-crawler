const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { scrapeLinkedInJobs } = require('./scraper');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { formatBytes, OUTPUT_DIR, ensureOutputDir } = require('./utils');

// Ensure output directory exists
ensureOutputDir();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/views/main.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('start-scrape', async (_, { keyword, location, jobCount, timeRange }) => {
  try {
    mainWindow.webContents.send('update-status', { 
      message: 'Starting scraper...', 
      type: 'processing' 
    });
    
    const result = await scrapeLinkedInJobs({ 
      keyword, 
      location, 
      jobCount: parseInt(jobCount) || 10,
      timeRange: timeRange || 'all'
    });
    
    if (result.error) {
      mainWindow.webContents.send('update-status', { 
        message: `Error: ${result.error}`, 
        type: 'error' 
      });
      return { error: result.error };
    }
    
    mainWindow.webContents.send('update-status', { 
      message: `Successfully scraped ${result.jobs.length} jobs!`, 
      type: 'success' 
    });
    
    return result;
  } catch (error) {
    mainWindow.webContents.send('update-status', { 
      message: `Error: ${error.message}`, 
      type: 'error' 
    });
    return { error: error.message };
  }
});

ipcMain.handle('get-files', () => {
  ensureOutputDir();
  
  try {
    return fs.readdirSync(OUTPUT_DIR)
      .filter(file => file.endsWith('.csv'))
      .map(file => {
        const stats = fs.statSync(path.join(OUTPUT_DIR, file));
        return {
          name: file,
          size: formatBytes(stats.size),
          date: stats.mtime.toLocaleString()
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.error('Error reading files:', error);
    return [];
  }
});

ipcMain.on('delete-file', (_, filename) => {
  const filePath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
});

ipcMain.on('open-file', (_, filename) => {
  const filePath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filePath)) {
    shell.openPath(filePath);
  } else {
    dialog.showErrorBox('File Not Found', `The file ${filename} could not be found.`);
  }
});

ipcMain.handle('download-file', async (_, filename) => {
  try {
    const filePath = path.join(OUTPUT_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return { error: 'File not found' };
    }
    
    const saveDialog = await dialog.showSaveDialog({
      title: 'Save CSV File',
      defaultPath: path.join(app.getPath('downloads'), filename),
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (saveDialog.canceled) {
      return { canceled: true };
    }
    
    fs.copyFileSync(filePath, saveDialog.filePath);
    
    return { success: true, savedPath: saveDialog.filePath };
  } catch (error) {
    console.error('Error downloading file:', error);
    return { error: error.message };
  }
});

// New IPC handlers for view functionality
ipcMain.handle('read-csv-file', (_, filename) => {
  try {
    const filePath = path.join(OUTPUT_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return { error: 'File not found' };
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true
    });
    
    return { data: records };
  } catch (error) {
    console.error('Error reading CSV file:', error);
    return { error: error.message };
  }
});

ipcMain.on('open-external', (_, url) => {
  shell.openExternal(url);
});