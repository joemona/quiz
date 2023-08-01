const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const path = require('path'); 
const paginate = require('express-paginate');

const app = express();
const port = 3000;

// Establish database connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'joep5630733',
  database: 'nouquizz',
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to database:', err);
    return;
  }
  console.log('Connected to the database');
});

app.use(paginate.middleware(5, 100));
app.set('views', path.join(__dirname, 'views'));

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Add this line to serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));



// Body parsing middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({ secret: 'secret-key', resave: false, saveUninitialized: false }));

// Session middleware
app.use(
    session({
      secret: 'your-secret-key',
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false }, // Change this to true if using HTTPS
    })
  );

// Custom middleware to pass req object to EJS template
app.use((req, res, next) => {
    res.locals.req = req;
    next();
  });

// Middleware to start the quiz timer on the quiz route
app.use('/quiz', (req, res, next) => {
  req.session.quizStartTime = Date.now();
  next();
});

// Home page route
app.get('/', (req, res) => {
  // Fetch and render the subjects list from the database
  const query = 'SELECT * FROM subjects';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error retrieving subjects:', err);
      res.status(500).render('error');
      return;
    }

    res.render('index', { subjects: results });
  });
});

// Instruction page route
app.get('/instructions', (req, res) => {
  // Fetch the subject name for the instruction page
  const selectedSubject = req.query.subject;
  const getSubjectQuery = 'SELECT name FROM subjects WHERE id = ?';
  db.query(getSubjectQuery, [selectedSubject], (err, subjectResults) => {
    if (err) {
      console.error('Error retrieving subject:', err);
      res.status(500).render('error');
      return;
    }

    const subject = subjectResults[0].name;
    res.render('instructions', { subject: subject, selectedSubject: selectedSubject });
  });
});

// ...





// Quiz route
app.get('/quiz', (req, res) => {
    const selectedSubject = req.query.subject;
    const currentPage = parseInt(req.query.page) || 1; // Parse the page query parameter or default to page 1
    const questionsPerPage = 5;
  
    if (!selectedSubject) {
      res.redirect('/');
    } else {
      const startIndex = (currentPage - 1) * questionsPerPage;
  
      const query = 'SELECT * FROM questions WHERE subject_id = ?';
      db.query(query, [selectedSubject], (err, results) => {
        if (err) {
          console.error('Error retrieving quiz questions:', err);
          res.status(500).render('error');
          return;
        }
  
        results.forEach((question) => {
          try {
            question.options = JSON.parse(question.options);
          } catch (e) {
            console.error('Error parsing options:', e);
            question.options = [];
          }
        });
  
        const getSubjectQuery = 'SELECT name FROM subjects WHERE id = ?';
        db.query(getSubjectQuery, [selectedSubject], (err, subjectResults) => {
          if (err) {
            console.error('Error retrieving subject:', err);
            res.status(500).render('error');
            return;
          }
  
          const subject = subjectResults[0].name;
  
          // Calculate the total number of pages
          const totalQuestions = results.length;
          const totalPages = Math.ceil(totalQuestions / questionsPerPage);
  
          // Get questions for the current page
          const questions = results.slice(startIndex, startIndex + questionsPerPage);
  
          // Retrieve the selected options from the session for the current page
          const selectedOptions = req.session.selectedOptions || {};
  
          res.render('quiz', {
            questions: questions,
            subject: subject,
            subjectId: selectedSubject, // Pass subjectId to the view
            currentPage: currentPage,
            totalPages: totalPages,
            questionsPerPage: questionsPerPage,
            selectedOptions: selectedOptions,
          });
        });
      });
    }
  });
  
  
  
  
  
  

// Quiz results route
app.post('/quiz/results', (req, res) => {
    const userAnswers = req.body;
    const selectedSubject = req.query.subject;
    const quizStartTime = req.session.quizStartTime;
  
    // Convert userAnswers to an object
    const userAnswersObject = {};
    for (const key in userAnswers) {
      userAnswersObject[key] = userAnswers[key];
    }
  
    // Store the selected options in the session
    req.session.selectedOptions = userAnswersObject;
  
    const getQuestionsQuery = 'SELECT * FROM questions WHERE subject_id = ?';
    db.query(getQuestionsQuery, [selectedSubject], (err, questions) => {
      if (err) {
        console.error('Error retrieving questions:', err);
        res.status(500).render('error');
        return;
      }
  
      const getSubjectQuery = 'SELECT name FROM subjects WHERE id = ?';
      db.query(getSubjectQuery, [selectedSubject], (err, subjectResults) => {
        if (err) {
          console.error('Error retrieving subject:', err);
          res.status(500).render('error');
          return;
        }
  
        const subject = subjectResults[0].name;
        const totalQuestions = questions.length;
        const score = calculateScore(userAnswersObject, questions);
  
        // Filter attempted and unattempted questions based on userAnswers
        const attemptedQuestions = questions.filter((question) => userAnswersObject.hasOwnProperty(`question_${question.id}`));
        const unattemptedQuestions = questions.filter((question) => !userAnswersObject.hasOwnProperty(`question_${question.id}`));
  
        // Calculate the time taken by the user
        const quizEndTime = Date.now();
        const quizDuration = quizEndTime - quizStartTime;
  
        res.render('results', {
          score: score,
          subject: subject,
          userAnswers: userAnswersObject,
          questions: questions, // Pass the questions to the view
          totalQuestions: totalQuestions,
          attemptedQuestions: attemptedQuestions,
          unattemptedQuestions: unattemptedQuestions,
          timeTaken: quizDuration / 1000, // Convert to seconds
          subjectId: selectedSubject, // Pass subjectId to the view
        });
      });
    });
  });

  
// Function to calculate the quiz score based on the user's answers
function calculateScore(userAnswers, questions) {
    let score = 0;
    for (const question of questions) {
      const userAnswer = userAnswers[`question_${question.id}`];
      if (userAnswer !== undefined && userAnswer === question.correct_answer) {
        // Increment the score if the user's answer matches the correct answer
        score++;
      }
    }
    return score;
  }

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
