import { useState, useEffect, useRef  } from "react";
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

  // ── upgraded dictionary state ──
  const [dictData, setDictData] = useState(null);   // full parsed result
  const [dictLoading, setDictLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [noteInput, setNoteInput] = useState("");
  const [showNoteBox, setShowNoteBox] = useState(false);
  const [savedRange, setSavedRange] = useState(null);

  const [books, setBooks] = useState({});
  const [currentBook, setCurrentBook] = useState(null);
  const [pageInput, setPageInput] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState(null);

  const containerRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("userId");
    if (savedUser) {
      setUserId(savedUser);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, books: updatedBooks })
    });
  };

  const handlePageChange = (e) => setPageInput(e.target.value);

  const goToPage = (e) => {
    if (e.key === "Enter") {
      const page = Number(pageInput);
      if (page >= 1 && page <= numPages) { setPageNum(page); savePage(page); }
      setPageInput("");
    }
  };

  // ── Save note ──
  const saveNote = () => {
    if (!currentBook || !selectedText || !noteInput.trim()) return;
    setBooks((prev) => {
      const updated = { ...prev };
      if (!updated[currentBook].notes) updated[currentBook].notes = [];
      if (!Array.isArray(updated[currentBook].notes)) updated[currentBook].notes = [];
      const exists = updated[currentBook].notes.some(
        (n) => n.word === selectedText && n.text === noteInput
      );
      if (exists) return prev;
      updated[currentBook].notes.push({
        text: noteInput,
        word: selectedText,
        page: pageNum,
        id: Date.now() + Math.random()
      });
      saveToBackend(updated);
      return updated;
    });
    setShowNoteBox(false);
    setNoteInput("");
    setSelectedText("");
  };

  const deleteNote = (noteId) => {
    if (!currentBook) return;
    setBooks((prev) => {
      const updated = { ...prev };
      const notes = updated[currentBook].notes || [];
      updated[currentBook].notes = notes.filter((n) => n.id !== noteId);
      saveToBackend(updated);
      return updated;
    });
  };

  // ── Selection ──
  const handleTextSelection = (e) => {
    if (e.target.closest(".popup")) return;
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      if (!text || text.length <= 0) { setSelectedText(""); return; }
      const range = selection.getRangeAt(0);
      setSavedRange(range.cloneRange());
      const rect = range.getBoundingClientRect();
      setSelectedHighlight(null);
      setSelectedText(text);
      setPopupPos({ top: rect.top + window.scrollY - 10, left: rect.left + window.scrollX + rect.width / 2 });
      setDictData(null);
      setShowNoteBox(false);
    }, 10);
  };

  // ── Upgraded dictionary ──
  const handleMeaning = async () => {
    const word = selectedText.trim().split(/\s+/)[0]; // single-word lookup
    setDictLoading(true);
    setDictData(null);
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      const data = await res.json();

      // if (!Array.isArray(data) || !data[0]) {
      //   setDictData({ error: "No definition found for + " " + word + " " });
      //   setDictLoading(false);
      //   return();
      // }

      const entry = data[0];

      // phonetic text — prefer the one with audio, fallback to first available
      const phoneticText =
        entry.phonetics?.find(p => p.text && p.audio)?.text ||
        entry.phonetics?.find(p => p.text)?.text ||
        entry.phonetic ||
        "";

      // audio URL for pronunciation
      const audioUrl =
        entry.phonetics?.find(p => p.audio)?.audio || "";

      // collect all meanings (up to 3 parts of speech)
      const meanings = entry.meanings.slice(0, 3).map(m => ({
        partOfSpeech: m.partOfSpeech,
        definitions: m.definitions.slice(0, 2).map(d => ({
          definition: d.definition,
          example: d.example || ""
        }))
      }));

      // synonyms from first meaning
      const synonyms = entry.meanings[0]?.synonyms?.slice(0, 5) || [];

      setDictData({ word: entry.word, phoneticText, audioUrl, meanings, synonyms });
    } catch {
      setDictData({ error: "Error fetching definition." });
    }
    setDictLoading(false);
  };

  // ── Pronunciation: prefer audio file, fallback to SpeechSynthesis ──
  const handleSpeak = () => {
    const word = selectedText.trim().split(/\s+/)[0];

    // try audio from dictionary first
    if (dictData?.audioUrl) {
      const audio = new Audio(dictData.audioUrl);
      audio.play().then(() => {
        setIsSpeaking(true);
        audio.onended = () => setIsSpeaking(false);
      }).catch(() => speakWithSynth(word)); // fallback
      return;
    }

    speakWithSynth(word);
  };

  const speakWithSynth = (word) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  // ── Highlight ──
  const handleHighlight = (color) => {
    if (!savedRange || !currentBook) return;
    const rects = savedRange.getClientRects();
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const groupId = Date.now() + Math.random();
    const rectArray = Array.from(rects).map((rect) => ({
      left: (rect.left - containerRect.left) / containerRect.width,
      top: (rect.top - containerRect.top) / containerRect.height,
      width: rect.width / containerRect.width,
      height: rect.height / containerRect.height,
    }));
    const newHighlight = { groupId, rects: rectArray, color };
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
    if (bookName === currentBook) {
      const remaining = Object.keys(books).filter(b => b !== bookName);
      setCurrentBook(remaining[0] || null);
      setPageNum(1);
    }
  };

  const removeHighlight = () => {
    if (!currentBook || !selectedHighlight) return;
    setBooks((prev) => {
      const updated = { ...prev };
      const { groupId, page } = selectedHighlight;
      if (!updated[currentBook]?.highlights?.[page]) return prev;
      const newHighlights = updated[currentBook].highlights[page].filter(h => h.groupId !== groupId);
      if (newHighlights.length === 0) delete updated[currentBook].highlights[page];
      else updated[currentBook].highlights[page] = newHighlights;
      saveToBackend(updated);
      return updated;
    });
    setSelectedHighlight(null);
    setSelectedText("");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (books[file.name]) { setCurrentBook(file.name); return; }
      const newBook = {
        file: reader.result,
        lastPage: 1,
        highlights: {},
        notes: [],
      };
      const updatedBooks = { ...books, [file.name]: newBook };
      setBooks(updatedBooks);
      saveToBackend(updatedBooks);
      setCurrentBook(file.name);
      setPageNum(1);
    };
    reader.readAsDataURL(file);
  };

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
        return "rgba(255, 255, 0, 0.3)";
      case "lightgreen":
        return "rgba(144, 238, 144, 0.5)";
      case "lightblue":
        return "rgba(173, 216, 230, 0.7)";
      case "pink":
        return "rgba(255, 182, 193, 0.4)";
      case "lavender":
        return "rgba(230, 230, 250, 1)";
      case "peach":
        return "rgba(255, 218, 185, 0.7)";
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
      <div className="auth-screen">
        <h2>📖 Smart Read</h2>
        <p>Login to continue</p>
        <input placeholder="Email" onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" onChange={(e) => setPassword(e.target.value)} />
        <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
          <button onClick={handleLogin}>Login</button>
          <button onClick={handleSignup} style={{ background: "#374151" }}>Signup</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">

      {/* LEFT SIDEBAR */}
      <div className="sidebar">
        <h3>Your Books</h3>
        {Object.keys(books).map((name) => (
          <div key={name} className={`book-item ${currentBook === name ? "active" : ""}`}
            onClick={() => { setCurrentBook(name); setPageNum(books[name]?.lastPage || 1); }}>
            <span className="book-name">{name}</span>
            <span className="remove-btn" onClick={(e) => { e.stopPropagation(); removeBook(name); }}>✖</span>
          </div>
        ))}
      </div>

      {/* MAIN CONTENT */}
      <div className="main-content">
        <h1>My Happiest Place 📖</h1>

        <input className="fileChoose" type="file" accept="application/pdf" onChange={handleFileUpload} />

        <div className="preNexBtn">
          <button disabled={pageNum <= 1} onClick={() => { const p = pageNum - 1; setPageNum(p); savePage(p); }}>Prev</button>
          <button disabled={pageNum >= numPages} onClick={() => { const p = pageNum + 1; setPageNum(p); savePage(p); }}>Next</button>
        </div>

        {numPages && (
          <div className="page-jump">
            <input type="number" placeholder={pageNum} value={pageInput}
              onChange={handlePageChange} onKeyDown={goToPage} min="1" max={numPages} />
            <span>/ {numPages}</span>
          </div>
        )}

        <div className="pdf-container" ref={containerRef}
          onMouseUp={handleTextSelection} onTouchEnd={handleTextSelection}
          onClick={() => { setSelectedText(""); setSelectedHighlight(null); }}>

          {currentBook && (
            <Document file={books[currentBook]?.file}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
              <Page
                pageNumber={pageNum}
                width={window.innerWidth < 768 ? window.innerWidth * 0.9 : 1100}
                renderTextLayer
              />
            </Document>
          )}

          {books[currentBook]?.highlights?.[pageNum]?.map((group, i) =>
            group.rects.map((h, j) => {
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return null;
              return (
                <div key={`${i}-${j}`} className="highlight-layer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedHighlight({ groupId: group.groupId, page: pageNum });
                    setPopupPos({ top: e.clientY + window.scrollY, left: e.clientX + window.scrollX });
                  }}
                  style={{
                    left: h.left * rect.width,
                    top: h.top * rect.height,
                    width: h.width * rect.width,
                    height: h.height * rect.height,
                    background: getTransparentColor(group.color),
                  }}
                />
              );
            })
          )}

          <button className="floating-prev" disabled={pageNum <= 1}
            onClick={() => { const p = pageNum - 1; setPageNum(p); savePage(p); }}>⬅</button>
          <button className="floating-next" disabled={pageNum >= numPages}
            onClick={() => { const p = pageNum + 1; setPageNum(p); savePage(p); }}>➡</button>
        </div>

        {/* ── TEXT POPUP ── */}
        {selectedText && (
          <div className="popup" style={{ top: popupPos.top, left: popupPos.left }}
            onClick={(e) => e.stopPropagation()}>

            {/* Header: selected word + close */}
            <div className="popup-header">
              <span className="popup-word">{selectedText.length > 30 ? selectedText.slice(0, 30) + "…" : selectedText}</span>
              <span className="popup-close" onClick={() => setSelectedText("")}>✕</span>
            </div>

            {/* Pronunciation row */}
            <div className="pronunciation-row">
              <button
                className={`speak-btn ${isSpeaking ? "speaking" : ""}`}
                onClick={handleSpeak}
                title="Pronounce"
              >
                🔊
              </button>
              {dictData?.phoneticText
                ? <span className="phonetic-text">{dictData.phoneticText}</span>
                : <span className="phonetic-hint">Click 🔊 or fetch meaning first</span>
              }
            </div>

            {/* Action buttons */}
            <div className="btns">
              <button onClick={handleMeaning} disabled={dictLoading}>
                {dictLoading ? "Loading…" : "Meaning"}
              </button>
              <button onClick={() => setShowNoteBox(v => !v)}>Note</button>
            </div>

            {/* ── Upgraded meaning card ── */}
            {dictData && !dictData.error && (
              <div className="dict-card">
                {dictData.meanings.map((m, mi) => (
                  <div key={mi} className="dict-meaning-group">
                    <span className="pos-badge">{m.partOfSpeech}</span>
                    {m.definitions.map((d, di) => (
                      <div key={di} className="dict-def">
                        <p className="def-text">• {d.definition}</p>
                        {d.example && <p className="def-example">"{d.example}"</p>}
                      </div>
                    ))}
                  </div>
                ))}
                {dictData.synonyms.length > 0 && (
                  <div className="dict-synonyms">
                    <span className="syn-label">Synonyms: </span>
                    {dictData.synonyms.join(", ")}
                  </div>
                )}
              </div>
            )}

            {dictData?.error && (
              <p className="dict-error">{dictData.error}</p>
            )}

            {/* Note box */}
            {showNoteBox && (
              <div className="note-box">
                <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Write note..." />
                <button onClick={saveNote}>Save</button>
              </div>
            )}

            {/* Saved notes for this word */}
            {Array.isArray(books[currentBook]?.notes) &&
              books[currentBook].notes
                .filter((n) => n.word === selectedText)
                .map((n) => (
                  <p key={n.id} className="saved-note">📝 {n.text}</p>
                ))}

            {/* Highlight colors */}
            <div className="colors">
              <span onClick={() => handleHighlight("yellow")} title="Yellow" />
              <span onClick={() => handleHighlight("lightgreen")} title="Green" />
              <span onClick={() => handleHighlight("lightblue")} title="Blue" />
              <span onClick={() => handleHighlight("pink")} title="Pink" />
              <span onClick={() => handleHighlight("lavender")} title="Lavender" />
              <span onClick={() => handleHighlight("peach")} title="Peach" />
            </div>
          </div>
        )}

        {/* HIGHLIGHT POPUP */}
        {selectedHighlight && (
          <div className="popup" style={{ top: popupPos.top, left: popupPos.left }}
            onClick={(e) => e.stopPropagation()}>
            <button onClick={removeHighlight}>Remove Highlight</button>
          </div>
        )}

      </div>

      {/* RIGHT SIDEBAR */}
      <div className="right-sidebar">
        <h3>Highlights</h3>
        {Object.entries(books[currentBook]?.highlights || {})
          .filter(([, arr]) => arr.length > 0)
          .sort((a, b) => a[0] - b[0])
          .map(([page]) => (
            <div key={page} className="page-item" onClick={() => setPageNum(Number(page))}>
              Page {page}
            </div>
          ))}

        <h3 style={{ marginTop: "20px" }}>Notes</h3>
        {Array.isArray(books[currentBook]?.notes) &&
          books[currentBook].notes
            .sort((a, b) => a.page - b.page)
            .map((note) => (
              <div key={note.id} className="page-item" onClick={() => setPageNum(note.page)}>
                <span>Page {note.page} — {note.word}</span>
                <span className="delete-note"
                  onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}>❌</span>
              </div>
            ))}
      </div>
    </div>
  );
}

export default App;
