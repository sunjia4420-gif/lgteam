const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const PASSWORDS_FILE = path.join(DATA_DIR, 'passwords.json');
const LOGS_FILE = path.join(DATA_DIR, 'access_logs.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// 读取 JSON 文件
function readJSON(filePath, defaultData = []) {
  try {
    if (!fs.existsSync(filePath)) {
      writeJSON(filePath, defaultData);
      return defaultData;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`读取文件失败 ${filePath}:`, err);
    return defaultData;
  }
}

// 写入 JSON 文件
function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`写入文件失败 ${filePath}:`, err);
    return false;
  }
}

// 生成 ID
function generateId(items) {
  if (items.length === 0) return 1;
  const maxId = Math.max(...items.map(item => item.id || 0));
  return maxId + 1;
}

// ============ 口令操作 ============

// 获取所有口令
function getPasswords() {
  return readJSON(PASSWORDS_FILE, []);
}

// 保存所有口令
function savePasswords(passwords) {
  return writeJSON(PASSWORDS_FILE, passwords);
}

// 根据口令值查找口令
function findPasswordByValue(passwordValue) {
  const passwords = getPasswords();
  return passwords.find(p => p.password === passwordValue && p.is_active);
}

// 根据 ID 查找口令
function findPasswordById(id) {
  const passwords = getPasswords();
  return passwords.find(p => p.id === id);
}

// 添加口令
function addPassword(passwordData) {
  const passwords = getPasswords();
  const newPassword = {
    id: generateId(passwords),
    name: passwordData.name,
    password: passwordData.password,
    created_at: new Date().toISOString(),
    expires_at: passwordData.expires_at || null,
    max_uses: passwordData.max_uses || null,
    used_count: 0,
    is_active: passwordData.is_active !== undefined ? passwordData.is_active : 1
  };
  passwords.push(newPassword);
  savePasswords(passwords);
  return newPassword;
}

// 更新口令
function updatePassword(id, passwordData) {
  const passwords = getPasswords();
  const index = passwords.findIndex(p => p.id === id);
  if (index === -1) return null;
  
  passwords[index] = { ...passwords[index], ...passwordData };
  savePasswords(passwords);
  return passwords[index];
}

// 删除口令
function deletePassword(id) {
  const passwords = getPasswords();
  const filtered = passwords.filter(p => p.id !== id);
  if (filtered.length === passwords.length) return false;
  savePasswords(filtered);
  return true;
}

// 增加口令使用次数
function incrementPasswordUsage(id) {
  const passwords = getPasswords();
  const index = passwords.findIndex(p => p.id === id);
  if (index === -1) return;
  
  passwords[index].used_count = (passwords[index].used_count || 0) + 1;
  savePasswords(passwords);
}

// ============ 访问日志操作 ============

// 获取所有日志
function getLogs() {
  return readJSON(LOGS_FILE, []);
}

// 添加日志
function addLog(logData) {
  const logs = getLogs();
  const newLog = {
    id: generateId(logs),
    password_id: logData.password_id,
    password_name: logData.password_name,
    ip_address: logData.ip_address,
    user_agent: logData.user_agent,
    accessed_at: new Date().toISOString()
  };
  logs.push(newLog);
  
  // 只保留最近 1000 条日志
  if (logs.length > 1000) {
    logs.splice(0, logs.length - 1000);
  }
  
  saveLogs(logs);
  return newLog;
}

// 保存日志
function saveLogs(logs) {
  return writeJSON(LOGS_FILE, logs);
}

// ============ 设置操作 ============

// 获取所有设置
function getSettings() {
  return readJSON(SETTINGS_FILE, {});
}

// 获取设置值
function getSetting(key) {
  const settings = getSettings();
  return settings[key];
}

// 保存设置
function saveSetting(key, value) {
  const settings = getSettings();
  settings[key] = value;
  return writeJSON(SETTINGS_FILE, settings);
}

// 初始化默认设置
function initSettings() {
  const settings = getSettings();
  if (!settings.admin_password) {
    settings.admin_password = 'admin123';
    writeJSON(SETTINGS_FILE, settings);
  }
}

// ============ 初始化 ============

// 初始化数据库（创建示例数据）
function initDatabase() {
  console.log('正在初始化数据库...');
  
  // 初始化设置
  initSettings();
  console.log('✓ 设置已初始化');
  
  // 检查是否有示例口令，如果没有则创建
  const passwords = getPasswords();
  if (passwords.length === 0) {
    addPassword({ name: '测试口令1', password: 'test001', is_active: 1 });
    addPassword({ name: '测试口令2', password: 'test002', is_active: 1 });
    console.log('✓ 示例口令已创建');
  }
  
  console.log('数据库初始化完成');
}

module.exports = {
  getPasswords,
  findPasswordByValue,
  findPasswordById,
  addPassword,
  updatePassword,
  deletePassword,
  incrementPasswordUsage,
  getLogs,
  addLog,
  getSetting,
  saveSetting,
  initDatabase
};
