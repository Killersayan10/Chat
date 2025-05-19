var ex=require('express');
var ap=ex();
var mon=require('mongoose');
var session=require('express-session');
const path = require('path');
ap.get('/',(req,res)=>{
    res.send('Hello World');
});

ap.get('/signup',( req,res)=>{
    res.sendFile(path.join(__dirname,'signup.html'));
});

mon.connect('mongodb://localhost:27017/signupdb',{
    useNewUrlParser:true,
    useUnifiedTopology:true
}).then(()=>{
    console.log('Connected to MongoDB');
}).catch((err)=>{
    console.error('Error connecting to MongoDB', err);
});

var user=mon.model('user',new mon.Schema({
    name:String,
    password:String
}));

var chat=mon.model('chat',new mon.Schema({
    from:String,
    to:String,
    date:String,
    time:String,
    message:String
}));

ap.post('/signup',ex.urlencoded({extended:true}),(req,res)=>{
    var name=req.body.username;
    var password=req.body.password;
    var user1=new user({
        name:name,
        password:password
    });
    user1.save().then(()=>{
        res.send('User signed up successfully');
    }).catch((err)=>{
        console.error('Error saving user', err);
        res.status(500).send('Error signing up');
    });

});
ap.listen(3998,()=>{
    console.log('Server is running on port 3000');
});

ap.get('/login',(req,res)=>{
    res.sendFile(path.join(__dirname,'login.html'));
});
// middleware goes once, near the top of your app.js
ap.use(ex.urlencoded({ extended: true }));

ap.use(session({
  secret:'yourname',
  resave: true,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));

// POST /login
ap.post('/login', async (req, res) => {
  const { username, password } = req.body;           // ① object-destructuring
  try {
    const userDoc = await user.findOne({ name: username }).exec();
    if (!userDoc) return res.status(401).send('Invalid username / password');

    /* ③  check the password (bcrypt is shown; adapt if you hash differently) */
    const ok = password === userDoc.password; // bcrypt.compareSync(password, userDoc.password);
    if (!ok) return res.status(401).send('Invalid username / password');
    req.session.yourname = username; // ④ store the username in the session

    
    /* ④  fetch all chats where the user is either sender OR recipient */
    const chats = await chat.find({
      $or: [{ from: username }, { to: username }],
    }).lean();

    /* ⑤  build the HTML page in memory (no res.sendFile & res.write mixing) */
    const links = chats
      .map(c => {
        const partner = c.from === username ? c.to : c.from;
        return `<a href="/chat/${partner}">${partner}</a>`;
      })
      .join('<br>');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Chat list</title></head>
      <body>
        <h1>Welcome, ${username}</h1>
        <h2>Your conversations</h2>
        ${links || '<p>No chats yet.</p>'}
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('Internal server error',);
  }
});

ap.get('/chat/:partner', async (req, res) => {
  const partner = req.params.partner;
  const username = req.session.yourname;

  if (!username) {
    return res.status(401).send('Please log in first');
  }

  try {
    // Fetch chat messages between the user and the partner
    const messages = await chat.find({
      $or: [
        { from: username, to: partner },
        { from: partner, to: username },
      ],
    }).lean();

    // Build the HTML page in memory
    const messageList = messages.map(m => {
      return `<p><strong>${m.from}:</strong> ${m.message} <em>${m.date} ${m.time}</em></p>`;
    }).join('');

    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Chat with ${partner}</title></head>
      <body>
        <h1>I am ${username} Chat with ${partner}</h1>
        <div>${messageList || '<p>No messages yet.</p>'}</div>
        <form action="/send" method="POST">
          <input type="hidden" name="to" value="${partner}">
          <input type="text" name="message" placeholder="Type your message here">
          <button type="submit">Send</button>
        </form>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error fetching chat:', err);
    res.status(500).send('Internal server error');
  }
});
ap.post('/send', async (req, res) => {
  
  const from = req.session.yourname;
  const to = req.body.to;
  const message = req.body.message;
  const date = new Date().toLocaleDateString();
  const time = new Date().toLocaleTimeString();

  if (!from) {
    return res.status(401).send('Please log in first');
  }

  const chat1 = new chat({
    from: from,
    to: to,
    date: date,
    time: time,
    message: message
  });

  try {
    await chat1.save();
    res.redirect(`/chat/${to}`);
  } catch (err) {
    console.error('Error saving message', err);
    res.status(500).send('Error sending message');
  }
});
