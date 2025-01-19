import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType, ImageRun } from 'docx';
import './App.css';

const API_KEY = process.env.REACT_APP_OPENAI_API_KEY;

const App = () => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(['', '', '', '', '']);
  const [aiResponse, setAiResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showLoading, setShowLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sections, setSections] = useState([]);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(-1);
  const [collapsedSections, setCollapsedSections] = useState({0: true, 1: true, 2: true, 3: true, 4: true});
  const inputRefs = useRef([]);

  useEffect(() => {
    if (step < 5 && inputRefs.current[step]) {
      inputRefs.current[step].focus();
    }
  }, [step]);

  const questions = [
    "1. Welk vakgebied betreft het?",
    "2. Wat is het leerdoel?",
    "3. Wat is de leeftijd van de leerlingen?",
    "4. Welke materialen wil je gebruiken?",
    "5. Zijn er nog andere wensen?"
  ];

  const toggleSection = (index) => {
    setCollapsedSections(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleInputChange = (e, index) => {
    const newAnswers = [...answers];
    newAnswers[index] = e.target.value;
    setAnswers(newAnswers);
  };

  const handleKeyPress = (e, index) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleNextQuestion();
    }
  };

  const handleNextQuestion = () => {
    if (answers[step].trim() !== '') {
      if (step < 4) {
        setStep(step + 1);
      } else {
        setShowLoading(true);
        setStep(5);
        generatePrompt();
      }
    }
  };

  const generateSection = async (section, minWords) => {
    console.log(`generateSection called for ${section}`);
    try {
      console.log('Making API request...');
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-4",
        messages: [
          {role: "system", content: "Je bent een ervaren docent en onderwijskundige die uitgebreide lesplanonderdelen ontwerpt."},
          {role: "user", content: `Schrijf een ${section} voor een lesplan over ${answers[0]} voor leerlingen van ${answers[2]} jaar oud. 
            Het leerdoel is: ${answers[1]}. 
            Gebruik de volgende materialen: ${answers[3]}. 
            Houd rekening met deze extra wensen: ${answers[4]}. 
            Deze sectie moet minimaal ${minWords} woorden bevatten.`}
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }, {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('API response received:', response.status);

      if (response?.data?.choices?.[0]?.message?.content) {
        let content = response.data.choices[0].message.content.trim();
        
        // LaTeX conversies
        content = content.replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2');
        content = content.replace(/\\\(/g, ' ').replace(/\\\)/g, ' ');
        content = content.replace(/\\div/g, ':');
        content = content.replace(/\\times/g, 'x');

        content = content.replace(/^#+\s*/gm, '');
        content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/^###\s*(.*?)$/gm, '<strong><em>$1</em></strong>');
        content = content.split('\n').map(paragraph => `<p>${paragraph}</p>`).join('');

        return `<div class="section-content section-appear">
          <h2 class="chapter-title">${section}</h2>
          ${content}
        </div>`;
      }
      throw new Error('Onverwachte response structuur van de API');
    } catch (error) {
      console.error('API Error:', error.response?.data || error.message);
      throw error;
    }
  };

  const generatePrompt = async () => {
    console.log('Start generatePrompt');
    setIsLoading(true);
    setShowLoading(true);
    setError(null);
    setSections([]);
    setCurrentSectionIndex(0);
    setCollapsedSections({0: true, 1: true, 2: true, 3: true, 4: true});

    const sectionsList = [
      { name: "Introductie", minWords: 150 },
      { name: "Kernconcepten", minWords: 200 },
      { name: "Praktische oefeningen", minWords: 400 },
      { name: "Succescriteria en toetsing", minWords: 100 },
      { name: "Afsluiting", minWords: 100 }
    ];

    const generateSectionWithDelay = async (index) => {
      console.log(`Starting section ${index}`);
      if (index >= sectionsList.length) {
        console.log('All sections completed');
        setIsLoading(false);
        setShowLoading(false);
        setCurrentSectionIndex(-1);
        return;
      }

      const section = sectionsList[index];
      try {
        setCurrentSectionIndex(index);
        console.log(`Generating section: ${section.name}`);
        
        const sectionContent = await generateSection(section.name, section.minWords);
        console.log(`Section generated: ${section.name}`);
        
        setSections(prevSections => {
          console.log(`Adding section ${index}: ${section.name}`);
          return [...prevSections, sectionContent];
        });
        
        console.log(`Waiting before next section`);
        setTimeout(() => {
          generateSectionWithDelay(index + 1);
        }, 2000);

      } catch (error) {
        console.error(`Error generating section ${section.name}:`, error);
        setError(`Er is een fout opgetreden bij ${section.name}: ${error.message}`);
        setIsLoading(false);
        setShowLoading(false);
      }
    };

    try {
      await generateSectionWithDelay(0);
    } catch (error) {
      console.error('Error in generatePrompt:', error);
      setError('Er is een onverwachte fout opgetreden');
      setIsLoading(false);
      setShowLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    
    // Voeg logo toe
    const logoImg = document.querySelector('.logo');
    if (logoImg) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Laad het logo als een Image object
      const img = new Image();
      img.src = logoImg.src;
      
      img.onload = () => {
        // Bereken de juiste verhoudingen
        const aspectRatio = img.width / img.height;
        const targetWidth = 30; // Verkleind van 60 naar 30
        const targetHeight = targetWidth / aspectRatio;
        
        // Centreer het logo
        const pageWidth = doc.internal.pageSize.width;
        const xPos = (pageWidth - targetWidth) / 2;
        
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const logoData = canvas.toDataURL('image/png');
        doc.addImage(logoData, 'PNG', xPos, 10, targetWidth, targetHeight);
        
        // Voeg titel toe met meer ruimte na het logo
        doc.setFont("helvetica", "bold");
        doc.setFontSize(24);
        const title = "Lesplan";
        const titleWidth = doc.getStringUnitWidth(title) * doc.getFontSize() / doc.internal.scaleFactor;
        const titleX = (pageWidth - titleWidth) / 2;
        doc.text(title, titleX, 50);

        // Voeg streep toe
        doc.setLineWidth(0.5);
        doc.line(20, 55, 190, 55);

        // Start content vanaf hier
        let y = 70;
        const margin = 20;
        const maxWidth = pageWidth - 2 * margin;

        sections.forEach((section, index) => {
          // Extraheer de titel
          const titleMatch = section.match(/<h2 class="chapter-title">(.*?)<\/h2>/);
          const title = titleMatch ? titleMatch[1] : `Sectie ${index + 1}`;
          
          // Voeg titel toe
          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          doc.text(title, margin, y);
          y += 8;

          // Extraheer en verwerk de content
          const contentDiv = document.createElement('div');
          contentDiv.innerHTML = section.replace(/<h2 class="chapter-title">.*?<\/h2>/, '');
          
          // Verwerk alle paragrafen
          const paragraphs = Array.from(contentDiv.getElementsByTagName('p'));
          doc.setFontSize(12);
          doc.setFont("helvetica", "normal");

          paragraphs.forEach(para => {
            const text = para.textContent || para.innerText;
            const lines = doc.splitTextToSize(text.trim(), maxWidth);
            
            // Check of we een nieuwe pagina nodig hebben
            if (y + (lines.length * 5) > doc.internal.pageSize.height - margin) {
              doc.addPage();
              y = 20;
            }

            doc.text(lines, margin, y);
            y += lines.length * 5 + 2;
          });

          y += 5;
          if (y > doc.internal.pageSize.height - margin) {
            doc.addPage();
            y = 20;
          }
        });

        // Voeg footer toe
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        const footer = "Dit lesplan is gemaakt met behulp van AI d.m.v. een app gemaakt door MijnLeerlijn.";
        const footerWidth = doc.getStringUnitWidth(footer) * doc.getFontSize() / doc.internal.scaleFactor;
        const footerX = (pageWidth - footerWidth) / 2;
        doc.text(footer, footerX, doc.internal.pageSize.height - 10);

        doc.save("lesplan.pdf");
      };

      img.onerror = () => {
        console.error('Error loading logo');
        doc.save("lesplan.pdf");
      };
    } else {
      doc.save("lesplan.pdf");
    }
  };

  const handleDownloadWord = async () => {
    try {
      const children = [];

      // Voeg logo toe als afbeelding
      const logoImg = document.querySelector('.logo');
      if (logoImg) {
        const response = await fetch(logoImg.src);
        const blob = await response.blob();
        
        // Bereken de juiste verhoudingen
        const aspectRatio = logoImg.width / logoImg.height;
        const targetWidth = 100;
        const targetHeight = targetWidth / aspectRatio;

        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: blob,
                transformation: {
                  width: targetWidth,
                  height: targetHeight
                }
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 }
          })
        );
      }

      // Voeg titel toe
      children.push(
        new Paragraph({
          text: "Lesplan",
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { before: 300, after: 300 }
        })
      );

      sections.forEach((section) => {
        // Extraheer de titel
        const titleMatch = section.match(/<h2 class="chapter-title">(.*?)<\/h2>/);
        const title = titleMatch ? titleMatch[1] : 'Sectie';
        
        // Voeg sectietitel toe
        children.push(
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 120 }
          })
        );

        // Extraheer en verwerk de content
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = section.replace(/<h2 class="chapter-title">.*?<\/h2>/, '');
        
        // Verwerk alle paragrafen
        const paragraphs = Array.from(contentDiv.getElementsByTagName('p'));
        
        paragraphs.forEach(para => {
          const text = para.textContent || para.innerText;
          if (text.trim()) {
            children.push(
              new Paragraph({
                text: text.trim(),
                spacing: { before: 120, after: 120 },
                style: 'normalParagraph'
              })
            );
          }
        });
      });

      // Voeg footer toe
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Dit lesplan is gemaakt met behulp van AI d.m.v. een app gemaakt door MijnLeerlijn.",
              italics: true,
              size: 18
            })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 300 }
        })
      );

      // Maak het document
      const doc = new Document({
        sections: [{
          properties: {},
          children: children
        }],
        styles: {
          paragraphStyles: [
            {
              id: "normalParagraph",
              name: "Normal",
              run: {
                size: 24,
                font: "Calibri"
              },
              paragraph: {
                spacing: { line: 276 }
              }
            }
          ]
        }
      });

      // Genereer en download
      const blob = await Packer.toBlob(doc);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'lesplan.docx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating Word document:', error);
    }
  };

  const handleRegeneratePlan = () => {
    setShowLoading(true);
    setSections([]);
    setCurrentSectionIndex(0);
    setCollapsedSections({0: true, 1: true, 2: true, 3: true, 4: true});
    generatePrompt();
  };

  const resetApp = () => {
    setStep(0);
    setAnswers(['', '', '', '', '']);
    setSections([]);
    setIsLoading(false);
    setShowLoading(false);
    setError(null);
    setCurrentSectionIndex(-1);
    setCollapsedSections({0: true, 1: true, 2: true, 3: true, 4: true});
  };
  
  const renderQuestion = (index) => (
    <div key={index} className="question-container">
      <h2>{questions[index]}</h2>
      <input 
        ref={el => inputRefs.current[index] = el}
        type="text" 
        value={answers[index]}
        onChange={(e) => handleInputChange(e, index)}
        onKeyPress={(e) => handleKeyPress(e, index)}
        className="input-field"
        disabled={index < step}
      />
    </div>
  );

  const renderResult = () => {
    return (
      <div className="result-container">
        <h2>Hier is het lesplan:</h2>
        
        {(currentSectionIndex >= 0 || sections.length > 0) && sections.length < 5 && (
          <div className="progress-message">
            <div className="progress-spinner"></div>
            <div className="progress-text">
              Het lesplan wordt nu gemaakt in 5 onderdelen. {sections.length} van de 5 onderdelen zijn nu gemaakt. 
              Elk onderdeel kan opengeklapt worden. Onderin kunt u het lesplan downloaden in pdf of word.
            </div>
          </div>
        )}

        {/* Voeg de footer tekst toe boven de knoppen */}
        {currentSectionIndex === -1 && sections.length === 5 && !error && (
          <div className="lesplan-footer">
            Dit lesplan is gemaakt met behulp van AI d.m.v. een app gemaakt door MijnLeerlijn.
          </div>
        )}
        
        {sections.map((section, index) => (
          <div key={index} className="section-wrapper">
            <div 
              className="chapter-title-wrapper" 
              onClick={() => toggleSection(index)}
            >
              <h2 className="chapter-title">
                <strong>{section.match(/<h2 class="chapter-title">(.*?)<\/h2>/)?.[1]}</strong>
                <span className="collapse-icon">
                  {collapsedSections[index] ? '▼' : '▲'}
                </span>
              </h2>
            </div>
            <div className={`section-content ${collapsedSections[index] ? 'collapsed' : ''}`}>
              <div dangerouslySetInnerHTML={{ 
                __html: section.replace(/<h2 class="chapter-title">.*?<\/h2>/, '')
              }} />
            </div>
          </div>
        ))}
        
        {currentSectionIndex === -1 && sections.length === 5 && !error && (
          <div className="button-container">
            <button onClick={handleRegeneratePlan} className="button regenerate-button">
              Genereer nogmaals
            </button>
            <button onClick={handleDownloadPDF} className="button download-button">
              Download PDF
            </button>
            <button onClick={handleDownloadWord} className="button download-word-button">
              Download in Word
            </button>
            <button onClick={resetApp} className="button new-plan-button">
              Ander Lesplan
            </button>
          </div>
        )}
        
        {error && <p className="error">{error}</p>}
      </div>
    );
  };

  const renderContent = () => {
    if (step < 5) {
      return (
        <>
          {questions.map((_, index) => (
            index <= step && renderQuestion(index)
          ))}
          {step < 4 && (
            <button 
              onClick={handleNextQuestion}
              className="button"
            >
              Volgende Vraag
            </button>
          )}
          {step === 4 && (
            <button 
              onClick={handleNextQuestion}
              className="button generate-button"
            >
              Genereer Lesplan
            </button>
          )}
        </>
      );
    } else {
      return renderResult();
    }
  };

  return (
    <div className="app">
      <div className="header-container">
        <header className="app-header">
          <img src="/Mijnleerlijn-logo.png" alt="MijnLeerlijn Logo" className="logo" />
        </header>
        <h1 className="app-title">Lesplan Generator</h1>
        <div className="streep-container">
          <img src="/Streep.png" alt="Streep" className="header-line" />
        </div>
      </div>
      <div className="content">
        {renderContent()}
      </div>
    </div>
  );
};

export default App;