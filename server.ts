/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';

const app = express();
const PORT = 3000;

// Database file paths in workspace root
const USERS_FILE = path.join(process.cwd(), 'users.json');

// Types definitions
interface User {
  email: string;
  password?: string; // undefined/empty for Google SSO users
  username: string;
  isGoogleUser: boolean;
  isVerified: boolean;
  verificationCode?: string | null;
  verificationCodeExpires?: number | null;
  profilePic?: string;
  googleAccessToken?: string;
}

// Database Helpers
function loadUsers(): User[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading users database:', err);
  }
  return [];
}

function saveUsers(users: User[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving users database:', err);
  }
}

// Nodemailer Real Email Dispatcher
async function sendRealEmail(to: string, subject: string, body: string) {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const sender = process.env.SMTP_SENDER || `"Binary Studio" <${user || 'noreply@binarystudio.com'}>`;

  if (!user || !pass) {
    console.warn('⚠️ SMTP_USER or SMTP_PASS not configured. Skipping real email send. Simulated email generated.');
    return { success: false, reason: 'smtp_not_configured' };
  }

  try {
    const isGmail = host.toLowerCase().includes('gmail.com') || host.toLowerCase().includes('googlemail.com');
    const transportConfig: any = isGmail ? {
      service: 'gmail',
      auth: {
        user,
        pass,
      },
    } : {
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    };

    const transporter = nodemailer.createTransport(transportConfig);

    const info = await transporter.sendMail({
      from: sender,
      to,
      subject,
      text: body,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e4e4e7; border-radius: 16px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #059669; font-weight: 900; font-size: 20px; letter-spacing: 0.1em; margin: 0; text-transform: uppercase;">BINARY STUDIO</h1>
            <p style="color: #71717a; font-size: 10px; margin-top: 4px; text-transform: uppercase; font-family: monospace;">Secure Authentication Portal</p>
          </div>
          <div style="border-top: 3px solid #10b981; padding-top: 20px; color: #18181b; font-size: 14px; line-height: 1.6;">
            <p style="margin: 0 0 16px 0;">${body.replace(/\n/g, '<br>')}</p>
          </div>
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e4e4e7; text-align: center; font-size: 10px; color: #a1a1aa; font-family: monospace;">
            <p style="margin: 0;">Đây là email bảo mật tự động được gửi từ hệ thống Binary Studio.</p>
            <p style="margin: 4px 0 0 0;">Nếu không phải bạn yêu cầu mã này, vui lòng bỏ qua thư.</p>
          </div>
        </div>
      `
    });

    console.log(`✉️ Real Email successfully sent to ${to}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    console.error(`❌ Failed to send real email to ${to}:`, err);
    return { success: false, error: err.message || err };
  }
}

// Token Encryption/Decryption Helper (Stateless Token)
function generateToken(email: string): string {
  return 'token_' + Buffer.from(email).toString('base64');
}

function getEmailFromToken(token: string | undefined): string | null {
  if (!token || !token.startsWith('token_')) return null;
  try {
    const base64 = token.slice(6);
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch (err) {
    return null;
  }
}

// Generate secure 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express v4/v5 CORS setup for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ==========================================
// API ROUTES
// ==========================================

// Register Route
app.post('/api/auth/register', (req, res) => {
  const { email, password, username } = req.body;

  if (!email || !password || !username) {
    return res.status(400).json({ error: 'Please fill in all standard fields: email, password, username.' });
  }

  const users = loadUsers();
  const existingUser = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (existingUser) {
    return res.status(400).json({ error: 'Email này đã được đăng ký.' });
  }

  // Create verified user directly
  const newUser: User = {
    email: email.toLowerCase(),
    password,
    username,
    isGoogleUser: false,
    isVerified: true,
    verificationCode: null,
    verificationCodeExpires: null,
    profilePic: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`
  };

  users.push(newUser);
  saveUsers(users);

  const token = generateToken(newUser.email);
  return res.json({
    status: 'success',
    user: {
      email: newUser.email,
      username: newUser.username,
      isGoogleUser: newUser.isGoogleUser,
      profilePic: newUser.profilePic
    },
    token
  });
});

// Verify Signup Route (Left for compatibility, but deprecated)
app.post('/api/auth/verify-signup', (req, res) => {
  const { email } = req.body;
  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'User registration context not found.' });
  }

  user.isVerified = true;
  saveUsers(users);

  const token = generateToken(user.email);
  return res.json({
    user: {
      email: user.email,
      username: user.username,
      isGoogleUser: user.isGoogleUser,
      profilePic: user.profilePic
    },
    token
  });
});

// Login Route
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'Tài khoản không tồn tại. Vui lòng đăng ký mới.' });
  }

  if (user.isGoogleUser) {
    return res.status(400).json({ error: 'Tài khoản này được đăng ký thông qua Google. Vui lòng đăng nhập bằng Google.' });
  }

  if (user.password !== password) {
    return res.status(400).json({ error: 'Mật khẩu không chính xác.' });
  }

  // Verify and log in immediately
  user.isVerified = true;
  saveUsers(users);

  const token = generateToken(user.email);
  return res.json({
    status: 'success',
    user: {
      email: user.email,
      username: user.username,
      isGoogleUser: user.isGoogleUser,
      profilePic: user.profilePic
    },
    token
  });
});

// Verify Login Route
app.post('/api/auth/verify-login', (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: 'Email and verification code are required.' });
  }

  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (user.verificationCode !== code) {
    return res.status(400).json({ error: 'Mã xác nhận không chính xác. Vui lòng thử lại.' });
  }

  if (user.verificationCodeExpires && Date.now() > user.verificationCodeExpires) {
    return res.status(400).json({ error: 'Mã xác nhận đã hết hạn. Vui lòng yêu cầu mã đăng nhập mới.' });
  }

  // Complete Login
  user.isVerified = true; // ensure verified
  user.verificationCode = null;
  user.verificationCodeExpires = null;
  saveUsers(users);

  const token = generateToken(user.email);
  return res.json({
    user: {
      email: user.email,
      username: user.username,
      isGoogleUser: user.isGoogleUser,
      profilePic: user.profilePic
    },
    token
  });
});

// Google Sign-In Route (Real Google OAuth 2.0 Integration)
app.get('/api/auth/google/url', (req, res) => {
  const CLIENT_ID = process.env.CLIENT_ID || process.env.OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || 'dummy_client_id';
  const redirectUri = req.query.redirect_uri as string;

  if (CLIENT_ID === 'dummy_client_id') {
    console.warn('⚠️ CLIENT_ID is not configured in the environment.');
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    access_type: 'online'
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.json({ url: authUrl });
});

// Google OAuth 2.0 Callback Route
app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code } = req.query;
  const CLIENT_ID = process.env.CLIENT_ID || process.env.OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.CLIENT_SECRET || process.env.OAUTH_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.get('host');
  const redirectUri = `${protocol}://${host}/auth/callback`;

  if (!code) {
    return res.status(400).send('<h3>Lỗi xác thực: Không nhận được Code từ Google.</h3>');
  }

  try {
    // Exchange Authorization Code for Access Token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string,
        client_id: CLIENT_ID || '',
        client_secret: CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      }).toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Failed to exchange Google OAuth code:', errorText);
      return res.status(400).send(`<h3>Xác thực Google thất bại</h3><p>${errorText}</p>`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string };

    // Fetch Google User Profile using Access Token
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    if (!userinfoResponse.ok) {
      const errorText = await userinfoResponse.text();
      return res.status(400).send(`<h3>Không thể lấy thông tin người dùng Google</h3><p>${errorText}</p>`);
    }

    const googleUser = await userinfoResponse.json() as { email: string; name: string; picture?: string };

    if (!googleUser.email) {
      return res.status(400).send('<h3>Không tìm thấy địa chỉ Email từ tài khoản Google.</h3>');
    }

    const users = loadUsers();
    let user = users.find((u) => u.email.toLowerCase() === googleUser.email.toLowerCase());

    if (!user) {
      // Register new Google User directly
      user = {
        email: googleUser.email.toLowerCase(),
        username: googleUser.name,
        isGoogleUser: true,
        isVerified: true,
        profilePic: googleUser.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(googleUser.name)}`,
        googleAccessToken: tokenData.access_token
      };
      users.push(user);
    } else {
      // Link standard user to Google SSO
      user.isGoogleUser = true;
      user.isVerified = true;
      user.googleAccessToken = tokenData.access_token;
      if (!user.profilePic && googleUser.picture) {
        user.profilePic = googleUser.picture;
      }
    }
    saveUsers(users);

    const token = generateToken(user.email);

    // Send success event back to AuthModal parent window
    res.send(`
      <html>
        <head>
          <title>Binary Studio - Authenticated</title>
          <style>
            body {
              background-color: #09090b;
              color: #f4f4f5;
              font-family: system-ui, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
            }
            .card {
              text-align: center;
              padding: 32px;
              border: 1px solid #27272a;
              border-radius: 16px;
              background-color: #18181b;
              max-width: 380px;
              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
            }
            .spinner {
              border: 3px solid rgba(16, 185, 129, 0.1);
              width: 36px;
              height: 36px;
              border-radius: 50%;
              border-left-color: #10b981;
              animation: spin 1s linear infinite;
              margin: 0 auto 16px;
            }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            h3 { color: #10b981; margin: 0 0 8px; }
            p { color: #a1a1aa; font-size: 13px; margin: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h3>Đăng nhập thành công!</h3>
            <p>Hệ thống đang đồng bộ dữ liệu tài khoản...</p>
          </div>
          <script>
            setTimeout(() => {
              if (window.opener) {
                window.opener.postMessage({
                  type: 'OAUTH_AUTH_SUCCESS',
                  user: ${JSON.stringify({
                    email: user.email,
                    username: user.username,
                    isGoogleUser: user.isGoogleUser,
                    profilePic: user.profilePic
                  })},
                  token: ${JSON.stringify(token)}
                }, '*');
                window.close();
              } else {
                localStorage.setItem('auth_user', JSON.stringify(${JSON.stringify(user)}));
                localStorage.setItem('auth_token', ${JSON.stringify(token)});
                window.location.href = '/';
              }
            }, 800);
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error('OAuth Callback Error:', err);
    res.status(500).send(`<h3>Lỗi xác thực hệ thống</h3><p>${err.message}</p>`);
  }
});

// Mock POST for fallback support
app.post('/api/auth/google', (req, res) => {
  const { email, name, picture } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Google Account email and name are required.' });
  }

  const users = loadUsers();
  let user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    // Register as a Google User directly
    user = {
      email: email.toLowerCase(),
      username: name, // Uses Google account name as username
      isGoogleUser: true,
      isVerified: true, // Auto-verified since it is Google SSO
      profilePic: picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`
    };
    users.push(user);
    saveUsers(users);
  } else {
    // If user already exists but was standard email user, link it or upgrade it
    if (!user.isGoogleUser) {
      user.isGoogleUser = true;
      user.isVerified = true;
      // Do not overwrite their current custom username if they already set one,
      // but if it is empty, set it to the Google Account name.
      if (!user.username) {
        user.username = name;
      }
      saveUsers(users);
    }
  }

  const token = generateToken(user.email);
  return res.json({
    user: {
      email: user.email,
      username: user.username,
      isGoogleUser: user.isGoogleUser,
      profilePic: user.profilePic
    },
    token
  });
});

// Update Username Route
app.post('/api/auth/update-username', (req, res) => {
  const authHeader = req.headers.authorization;
  const { newUsername } = req.body;

  if (!newUsername || !newUsername.trim()) {
    return res.status(400).json({ error: 'Username cannot be blank.' });
  }

  const token = authHeader?.split(' ')[1];
  const email = getEmailFromToken(token);

  if (!email) {
    return res.status(401).json({ error: 'Unauthorized or invalid session. Please login again.' });
  }

  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'User profile not found.' });
  }

  user.username = newUsername.trim();
  saveUsers(users);

  return res.json({
    success: true,
    user: {
      email: user.email,
      username: user.username,
      isGoogleUser: user.isGoogleUser,
      profilePic: user.profilePic
    }
  });
});

// Get Current Logged In User
app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  const email = getEmailFromToken(token);

  if (!email) {
    return res.status(401).json({ error: 'No active session found.' });
  }

  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'User profile not found.' });
  }

  return res.json({
    user: {
      email: user.email,
      username: user.username,
      isGoogleUser: user.isGoogleUser,
      profilePic: user.profilePic
    }
  });
});

// ==========================================
// GMAIL API PROXY ENDPOINTS
// ==========================================

// Get user inbox messages
app.get('/api/gmail/messages', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  const email = getEmailFromToken(token);

  if (!email) {
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' });
  }

  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user || !user.isGoogleUser || !user.googleAccessToken) {
    return res.status(400).json({ error: 'Vui lòng liên kết tài khoản Google để sử dụng tính năng này.' });
  }

  try {
    const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15', {
      headers: { Authorization: `Bearer ${user.googleAccessToken}` }
    });

    if (!listRes.ok) {
      if (listRes.status === 401) {
        return res.status(401).json({ error: 'Quyền truy cập Google hết hạn. Vui lòng đăng nhập lại bằng Google.' });
      }
      const errText = await listRes.text();
      return res.status(listRes.status).json({ error: errText });
    }

    const listData = await listRes.json() as { messages?: { id: string; threadId: string }[] };

    if (!listData.messages || listData.messages.length === 0) {
      return res.json({ messages: [] });
    }

    // Fetch detail metadata in parallel for better performance
    const detailsPromises = listData.messages.map(async (msg) => {
      try {
        const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
          headers: { Authorization: `Bearer ${user!.googleAccessToken}` }
        });
        if (!detailRes.ok) return null;
        const detail = await detailRes.json() as any;

        const headers = detail.payload?.headers || [];
        const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(Không có tiêu đề)';
        const from = headers.find((h: any) => h.name === 'From')?.value || 'Không rõ người gửi';
        const date = headers.find((h: any) => h.name === 'Date')?.value || '';

        return {
          id: msg.id,
          threadId: msg.threadId,
          subject,
          from,
          date,
          snippet: detail.snippet || '',
          labelIds: detail.labelIds || []
        };
      } catch (e) {
        return null;
      }
    });

    const detailedMessages = (await Promise.all(detailsPromises)).filter(Boolean);
    res.json({ messages: detailedMessages });
  } catch (err: any) {
    console.error('Gmail list messages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get a single message by ID with body content
app.get('/api/gmail/messages/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  const email = getEmailFromToken(token);

  if (!email) {
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn.' });
  }

  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user || !user.isGoogleUser || !user.googleAccessToken) {
    return res.status(400).json({ error: 'Chưa liên kết tài khoản Google.' });
  }

  try {
    const detailRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${req.params.id}`, {
      headers: { Authorization: `Bearer ${user.googleAccessToken}` }
    });

    if (!detailRes.ok) {
      if (detailRes.status === 401) {
        return res.status(401).json({ error: 'Quyền truy cập Google hết hạn. Vui lòng đăng nhập lại.' });
      }
      return res.status(detailRes.status).json({ error: 'Không thể lấy nội dung thư.' });
    }

    const detail = await detailRes.json() as any;

    const headers = detail.payload?.headers || [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(Không có tiêu đề)';
    const from = headers.find((h: any) => h.name === 'From')?.value || 'Không rõ người gửi';
    const to = headers.find((h: any) => h.name === 'To')?.value || '';
    const date = headers.find((h: any) => h.name === 'Date')?.value || '';

    // Extractor helper to parse multipart email bodies recursively
    const extractBody = (part: any): string => {
      if (part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) {
        for (const subPart of part.parts) {
          const body = extractBody(subPart);
          if (body) return body;
        }
      }
      return '';
    };

    let body = extractBody(detail.payload || {});
    if (!body && detail.snippet) {
      body = detail.snippet;
    }

    res.json({
      id: detail.id,
      threadId: detail.threadId,
      subject,
      from,
      to,
      date,
      body,
      snippet: detail.snippet || '',
      labelIds: detail.labelIds || []
    });
  } catch (err: any) {
    console.error('Gmail get message detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Send an email with optional base64 binary attachment
app.post('/api/gmail/send', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  const email = getEmailFromToken(token);

  if (!email) {
    return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn.' });
  }

  const { to, subject, body, filename, fileContentB64 } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Vui lòng cung cấp To, Subject, và Body.' });
  }

  const users = loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user || !user.isGoogleUser || !user.googleAccessToken) {
    return res.status(400).json({ error: 'Chưa kết nối tài khoản Google.' });
  }

  try {
    let rawMessage = '';
    const boundary = 'binary_studio_boundary_parts';

    if (filename && fileContentB64) {
      // Multipart message with attachment
      rawMessage = [
        `From: me`,
        `To: ${to}`,
        `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        ``,
        `--${boundary}`,
        `Content-Type: text/plain; charset="UTF-8"`,
        `Content-Transfer-Encoding: 7bit`,
        ``,
        body,
        ``,
        `--${boundary}`,
        `Content-Type: application/octet-stream; name="${filename}"`,
        `Content-Description: ${filename}`,
        `Content-Disposition: attachment; filename="${filename}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        fileContentB64,
        ``,
        `--${boundary}--`
      ].join('\r\n');
    } else {
      // Standard email
      rawMessage = [
        `From: me`,
        `To: ${to}`,
        `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `Content-Type: text/plain; charset="UTF-8"`,
        ``,
        body
      ].join('\r\n');
    }

    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.googleAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw: encodedMessage })
    });

    if (!sendRes.ok) {
      if (sendRes.status === 401) {
        return res.status(401).json({ error: 'Quyền truy cập Google hết hạn. Vui lòng đăng nhập lại.' });
      }
      const errText = await sendRes.text();
      return res.status(sendRes.status).json({ error: errText });
    }

    const sendData = await sendRes.json();
    res.json({ success: true, message: sendData });
  } catch (err: any) {
    console.error('Gmail send error:', err);
    res.status(500).json({ error: err.message });
  }
});



// ==========================================
// VITE MIDDLEWARE & STATIC ASSET SERVING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // In development mode, load Vite server as middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted successfully.');
  } else {
    // In production mode, serve built static assets from dist/
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Express Server running at http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup exception:', err);
});
