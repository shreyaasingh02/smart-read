import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker?url";
import "./App.css";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

function App() {
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(null);

  const [selectedText, setSelectedText] = useState("");
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const [selectedHighlight, setSelectedHighlight] = useState(null);

  const [meaning, setMeaning] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [showNoteBox, setShowNoteBox] = useState(false);
  const [savedRange, setSavedRange] = useState(null);

  const [books, setBooks] = useState({});
  const [currentBook, setCurrentBook] = useState(null);
  const [pageInput, setPageInput] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState(null);

  useEffect(() => {
  const savedUser = localStorage.getItem("userId");

  if (savedUser) {
    setUserId(savedUser);

    // 🔥 also fetch books again
    fetch("https://book-backend-iupp.onrender.com/api/login", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ userId: savedUser })
    })
    .then(res => res.json())
    .then(data => {
      const booksFromDB = data.books || {};
      setBooks(booksFromDB);

      const firstBook = Object.keys(booksFromDB)[0];
      if (firstBook) setCurrentBook(firstBook);
    });
  }
}, []);

  const saveToBackend = async (updatedBooks) => {
    if (!userId) return;

    await fetch("https://book-backend-iupp.onrender.com/api/save-books", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId,
        books: updatedBooks
      })
    });
    console.log("Saving with userId:", userId);
  };

  const handlePageChange = (e) => {
    setPageInput(e.target.value);
  };

  const goToPage = (e) => {
    if (e.key === "Enter") {
      const page = Number(pageInput);

      if (page >= 1 && page <= numPages) {
        setPageNum(page);
        savePage(page);
      }

      setPageInput(""); // clear after jump
    }
  };
  // Save note
  const saveNote = () => {
    if (!currentBook || !selectedText) return;
    if (!noteInput.trim()) return;
    setBooks((prev) => {
      const updated = { ...prev };

      if (!updated[currentBook].notes) {
        updated[currentBook].notes = [];
      }

      if (!Array.isArray(updated[currentBook].notes)) {
        updated[currentBook].notes = [];
      }

      const exists = updated[currentBook].notes.some(
        (n) => n.word === selectedText && n.text === noteInput
      );

      if (exists) return prev;
      // ✅ save BEFORE clearing
      updated[currentBook].notes.push({
        text: noteInput,
        word: selectedText,
        page: pageNum,
        id: Date.now() + Math.random()
      }); 

      saveToBackend(updated);
      return updated;
    });

    // ✅ now clear AFTER saving
    setShowNoteBox(false);
    setNoteInput("");
    setSelectedText("");
  };

  const deleteNote = (noteId) => {
    if (!currentBook) return;

    setBooks((prev) => {
      const updated = { ...prev };

      const notes = updated[currentBook].notes || [];

      updated[currentBook].notes = notes.filter(
        (n) => n.id !== noteId
      );

      saveToBackend(updated);
      return updated;
    });
  };
  // Selection
  const handleTextSelection = (e) => {
    if (e.target.closest(".popup")) return;

    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (!text || text.length <= 0) {
        setSelectedText("");
        return;
      }

      const range = selection.getRangeAt(0);
      setSavedRange(range.cloneRange());

      const rect = range.getBoundingClientRect();

      setSelectedHighlight(null);
      setSelectedText(text);

      setPopupPos({top: rect.top + window.scrollY - 10, left: rect.left + window.scrollX + rect.width / 2});

      setMeaning("");
      setShowNoteBox(false);
    }, 10);
  };

  // Meaning
  const handleMeaning = async () => {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${selectedText}`);
      const data = await res.json();

      const def = data[0]?.meanings[0]?.definitions[0]?.definition || "No meaning found";
      setMeaning(def);
    } catch {
      setMeaning("Error fetching meaning");
    }
  };

  // Highlight
  const handleHighlight = (color) => {
    if (!savedRange || !currentBook) return;

    const rects = savedRange.getClientRects();
    const container = document.querySelector(".pdf-container");
    const containerRect = container.getBoundingClientRect();

    const groupId = Date.now() + Math.random();

    const rectArray = Array.from(rects).map((rect) => ({
      left: rect.left - containerRect.left,
      top: rect.top - containerRect.top,
      width: rect.width,
      height: rect.height,
    }));

    const newHighlight = {
      groupId,
      rects: rectArray,
      color,
    };

    setBooks((prev) => {
      const updated = { ...prev };
      const book = updated[currentBook];

      if (!book.highlights) book.highlights = {};
      if (!book.highlights[pageNum]) book.highlights[pageNum] = [];

      book.highlights[pageNum].push(newHighlight);

      saveToBackend(updated);
      return updated;
    });

    setSelectedHighlight({ groupId, page: pageNum });
    setSelectedText("");
  };

  const removeBook = (bookName) => {
    setBooks((prev) => {
      const updated = { ...prev };

      delete updated[bookName];

      saveToBackend(updated);

      return updated;
    });

    // handle current book
    if (bookName === currentBook) {
      const remaining = Object.keys(books).filter(b => b !== bookName);
      setCurrentBook(remaining[0] || null);
      setPageNum(1);
    }
  };
  // Remove highlight
  const removeHighlight = () => {
    if (!currentBook || !selectedHighlight) return;

    setBooks((prev) => {
      const updated = { ...prev };

      const { groupId, page } = selectedHighlight;

      // 🔥 SAFETY CHECK
      if (!updated[currentBook]?.highlights?.[page]) {
        return prev;
      }

      const pageHighlights = updated[currentBook].highlights[page];

      const newHighlights = pageHighlights.filter(
        (h) => h.groupId !== groupId
      );

      if (newHighlights.length === 0) {
        delete updated[currentBook].highlights[page];
      } else {
        updated[currentBook].highlights[page] = newHighlights;
      }

      saveToBackend(updated);
      return updated;
    });

    setSelectedHighlight(null);
    setSelectedText("");
  };

  // Upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const base64 = reader.result;

      const newBook = {
        file: base64,
        highlights: {},
        notes: [],
      };

      const updatedBooks = {
        ...books,
        [file.name]: newBook,
      };

      setBooks(updatedBooks);

      saveToBackend(updatedBooks);

      setCurrentBook(file.name);
      setPageNum(1);
    };

    reader.readAsDataURL(file);
    console.log("File size:", file.size);
  };

  // Save page
  const savePage = (page) => {
    if (!currentBook) return;

    setBooks((prev) => {
      const updated = { ...prev };
      updated[currentBook].lastPage = page;

      saveToBackend(updated);
      return updated;
    });
  };

  const getTransparentColor = (color) => {
    switch (color) {
      case "yellow":
        return "rgba(255, 255, 0, 0.4)";
      case "lightgreen":
        return "rgba(144, 238, 144, 0.4)";
      case "lightblue":
        return "rgba(173, 216, 230, 0.4)";
      case "pink":
        return "rgba(255, 182, 193, 0.4)";
      case "lavender":
        return "rgba(230, 230, 250, 0.5)";
      case "peach":
        return "rgba(255, 218, 185, 0.5)";
      default:
        return color;
    }
  };

  const handleSignup = async () => {
    await fetch("https://book-backend-iupp.onrender.com/api/signup", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ email, password })
    });
  };

  const handleLogin = async () => {
    const res = await fetch("https://book-backend-iupp.onrender.com/api/login", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    setUserId(data.userId);

    const booksFromDB = data.books || {};
    setBooks(booksFromDB);

    const firstBook = Object.keys(booksFromDB)[0];
    if (firstBook) setCurrentBook(firstBook);
    localStorage.setItem("userId", data.userId);
  };
  
  
  if (!userId) {
    return (
      <div>
        <h2>Login First</h2>
        <input onChange={(e) => setEmail(e.target.value)} />
        <input type="password" onChange={(e) => setPassword(e.target.value)} />
        <button onClick={handleLogin}>Login</button>
        <button onClick={handleSignup}>Signup</button>
      </div>
    );
  }

  return (
    <div className="app-container">

      <div className="sidebar">
        <h3>Your Books</h3>

        {Object.keys(books).map((name) => (
          <div key={name} className={`book-item ${currentBook === name ? "active" : ""}`}
            onClick={() => {
              setCurrentBook(name);
              setPageNum(books[name]?.lastPage || 1);
            }}
          >
            <span className="book-name">{name}</span>

            {/* ❌ remove button */}
            <span className="remove-btn" onClick={(e) => { e.stopPropagation(); removeBook(name)}}>✖</span>
          </div>
        ))}
      </div>
      
      <div className="main-content">
        <h1>My Happiest Place 📖</h1>

        <input className="fileChoose" type="file" accept="application/pdf" onChange={handleFileUpload} />

        <div className="preNexBtn">
          <button disabled={pageNum <= 1} onClick={() => {const p = pageNum - 1; setPageNum(p); savePage(p)}}>Prev</button>
          <button disabled={pageNum >= numPages} onClick={() => {const p = pageNum + 1; setPageNum(p); savePage(p)}}>Next</button>
        </div>

        {numPages && (
          <div className="page-jump">
            <input
              type="number"
              placeholder={pageNum}
              value={pageInput}
              onChange={handlePageChange}
              onKeyDown={goToPage}
              min="1"
              max={numPages}
            />
            <span>/ {numPages}</span>
          </div>
        )}

        <div className="pdf-container" onMouseUp={handleTextSelection} onTouchEnd={handleTextSelection} onClick={() => {setSelectedText(""); setSelectedHighlight(null)}}>
          {currentBook && (
            <Document file={books[currentBook]?.file} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              <Page
                pageNumber={pageNum}
                width={window.innerWidth < 768 ? window.innerWidth * 0.9 : 1100}
                renderTextLayer
              />
            </Document>
          )}

          {books[currentBook]?.highlights?.[pageNum]?.map((group, i) =>
            group.rects.map((h, j) => (
              <div key={`${i}-${j}`} className="highlight-layer" onClick={(e) => {e.stopPropagation();
                setSelectedHighlight({groupId: group.groupId, page: pageNum});
                setPopupPos({top: e.clientY + window.scrollY, left: e.clientX + window.scrollX})}}
                style={{
                  left: h.left,
                  top: h.top,
                  width: h.width,
                  height: h.height,
                  background: getTransparentColor(group.color),
                }}
              />
            ))
          )}
          <button className="floating-prev" disabled={pageNum <= 1} onClick={() => {const p = pageNum - 1; setPageNum(p); savePage(p)}}> ⬅ </button>
          <button
            className="floating-next"
            disabled={pageNum >= numPages}
            onClick={() => {
              const p = pageNum + 1;
              setPageNum(p);
              savePage(p);
            }}
          >
            ➡
          </button>
        </div>

        {/* TEXT POPUP */}
        {selectedText && (
          <div className="popup" style={{ top: popupPos.top, left: popupPos.left }}>
            <p>{selectedText}</p>

            <div className="btns">
              <button onClick={handleMeaning}>Meaning</button>
              <button onClick={() => setShowNoteBox(true)}>Note</button>
            </div>

            {meaning && <p>{meaning}</p>}

            {showNoteBox && (
              <div className="note-box">
                <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)} placeholder="Write note..."/>
                <button onClick={saveNote}>Save</button>
              </div>
            )}

            {Array.isArray(books[currentBook]?.notes) &&
              books[currentBook].notes
                .filter((n) => n.word === selectedText)
                .map((n) => (
                  <p key={n.id} className="saved-note">
                    📝 {n.text}
                  </p>
            ))}

            <div className="colors">
              <span onClick={() => handleHighlight("yellow")} />
              <span onClick={() => handleHighlight("lightgreen")} />
              <span onClick={() => handleHighlight("lightblue")} />
              <span onClick={() => handleHighlight("pink")} />
              <span onClick={() => handleHighlight("lavender")} />
              <span onClick={() => handleHighlight("peach")} />
            </div>
          </div>
        )}

        {/* HIGHLIGHT POPUP */}
        {selectedHighlight && (
          <div className="popup" style={{ top: popupPos.top, left: popupPos.left }}>
            <button onClick={removeHighlight}>Undo</button>
          </div>
        )}

      </div>

      <div className="right-sidebar">
        <h3>Highlights</h3>

        {Object.entries(books[currentBook]?.highlights || {})
          .filter(([page, arr]) => arr.length > 0)
          .sort((a, b) => a[0] - b[0])
          .map(([page]) => (
            <div
              key={page}
              className="page-item"
              onClick={() => setPageNum(Number(page))}
            >
              Page {page}
            </div>
          ))}

        <h3 style={{ marginTop: "20px" }}>Notes</h3>

        {Array.isArray(books[currentBook]?.notes) &&
          books[currentBook].notes
            .sort((a, b) => a.page - b.page)
            .map((note) => (
              <div
                key={note.id}
                className="page-item"
                onClick={() => setPageNum(note.page)}
              >
                <span>
                  Page {note.page} — {note.word}
                </span>

                {/* ❌ DELETE BUTTON */}
                <span
                  className="delete-note"
                  onClick={(e) => {
                    e.stopPropagation(); // 🔥 VERY IMPORTANT
                    deleteNote(note.id);
                  }}
                >
                  ❌
                </span>
              </div>
        ))}

      </div>
    </div>
  );
}

export default App;