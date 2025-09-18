import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, signInAnonymously, signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import { 
    getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, 
    collection, query, where, getDocs, writeBatch
} from 'firebase/firestore';

// --- Helper: Icon Component ---
// Using inline SVGs for icons to keep it self-contained
const Icon = ({ name, className }) => {
    const icons = {
        'book': <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>,
        'plus': <><path d="M5 12h14"/><path d="M12 5v14"/></>,
        'user': <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
        'image': <><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></>,
        'log-out': <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></>,
        'trash': <><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></>,
        'edit': <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
        'share': <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></>,
        'loader': <path d="M21 12a9 9 0 1 1-6.219-8.56"/>,
        'arrow-left': <><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></>,
        'copy': <><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></>,
        'wand': <><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M12.07 4.93 10.66 6.34"/><path d="M19.07 11.93 17.66 13.34"/><path d="M4.93 11.93 6.34 10.66"/><path d="M13.34 17.66 11.93 19.07"/><path d="M2 15h2"/><path d="M20 15h2"/><path d="M4.93 4.93 6.34 6.34"/><path d="M17.66 10.66 19.07 11.93"/><path d="m9 15 6-6"/><path d="M9 9h.01"/></>,
        'info': <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></>,
    };

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            {icons[name]}
        </svg>
    );
};


// --- Firebase Initialization & Hooks ---
let db, auth;
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const appId = import.meta.env.VITE_FIREBASE_APP_ID || 'default-app-id';

if (firebaseConfig.apiKey) {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
}

const useAuth = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    return { user, loading };
};

// --- API Call for Image Generation with Retry Logic ---
const generateImage = async (prompt, referenceImageUrls = [], maxRetries = 3, onRetry) => {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempt ${attempt}/${maxRetries} - Generating image...`);

            const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;

            const parts = [{ text: prompt }];

            for (const url of referenceImageUrls) {
                if (url && url.startsWith('data:image/')) {
                    const base64Data = url.split(',')[1];
                    const mimeType = url.substring(url.indexOf(':') + 1, url.indexOf(';'));
                    parts.push({
                        inlineData: {
                            mimeType,
                            data: base64Data
                        }
                    });
                }
            }

            const payload = {
                contents: [{ parts }],
                generationConfig: {
                    responseModalities: ['IMAGE']
                },
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API Error: ${response.status} ${errorBody}`);
            }

            const result = await response.json();
            const base64Data = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

            if (base64Data) {
                console.log(`Image generated successfully on attempt ${attempt}`);
                return `data:image/png;base64,${base64Data}`;
            } else {
                console.error("Unexpected API response structure:", result);
                throw new Error("No image data in API response.");
            }

        } catch (error) {
            console.error(`Attempt ${attempt}/${maxRetries} failed:`, error);
            lastError = error;

            // Si no es el último intento, esperar y reintentar
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000; // Delay exponencial: 1s, 2s, 4s
                console.log(`Retrying in ${delay}ms...`);

                // Notificar al callback sobre el reintento
                if (onRetry) {
                    onRetry(attempt, maxRetries, delay);
                }

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Si llegamos aquí, todos los intentos fallaron
    console.error("All retry attempts failed. Last error:", lastError);
    return null;
};

const compressImage = (base64Str, maxWidth = 1024, maxHeight = 1024, quality = 0.8) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            let { width, height } = img;
            
            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Using JPEG for compression
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = (error) => {
            console.error("Image loading for compression failed:", error);
            reject(new Error("Image loading for compression failed"));
        };
    });
};


// --- UI Components ---
const LoadingSpinner = ({ size = 'md' }) => {
    const sizeClasses = { sm: 'w-6 h-6', md: 'w-12 h-12', lg: 'w-24 h-24' };
    return (
        <div className="flex justify-center items-center p-4">
            <Icon name="loader" className={`${sizeClasses[size]} animate-spin text-indigo-500`} />
        </div>
    );
};

const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md m-4">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
};


// --- Pages/Views ---

// 2. Dashboard (Series List)
const Dashboard = ({ user, onSelectSeries }) => {
    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newSeriesTitle, setNewSeriesTitle] = useState('');
    const [newSeriesStyle, setNewSeriesStyle] = useState('estilo manga blanco y negro');

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        const seriesCollectionPath = `/artifacts/${appId}/public/data/series`;
        const q = query(collection(db, seriesCollectionPath), where("ownerId", "==", user.uid));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const seriesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSeries(seriesData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching series:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleCreateSeries = async () => {
        if (!newSeriesTitle.trim() || !newSeriesStyle.trim()) return;
        const seriesCollectionPath = `/artifacts/${appId}/public/data/series`;
        await addDoc(collection(db, seriesCollectionPath), {
            title: newSeriesTitle,
            style: newSeriesStyle,
            ownerId: user.uid,
            createdAt: new Date(),
        });
        setNewSeriesTitle('');
        setNewSeriesStyle('estilo manga blanco y negro');
        setIsModalOpen(false);
    };
    
    const handleLogout = () => {
        signOut(auth);
    };

    if (loading) return <div className="p-8"><LoadingSpinner /></div>;

    return (
        <div className="p-4 sm:p-8 bg-gray-50 min-h-screen">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-gray-800">Tus Series de Cómics</h1>
                <button onClick={handleLogout} className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition">
                    <Icon name="log-out" className="w-5 h-5" /> Salir
                </button>
            </header>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {series.map(s => (
                    <div key={s.id} onClick={() => onSelectSeries(s.id)} className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg hover:scale-105 transition-transform duration-300 cursor-pointer">
                        <h2 className="text-xl font-bold text-gray-800 truncate mb-2">{s.title}</h2>
                        <p className="text-gray-500 text-sm truncate italic">"{s.style}"</p>
                    </div>
                ))}
                <div 
                    onClick={() => setIsModalOpen(true)}
                    className="flex flex-col items-center justify-center bg-gray-200 p-6 rounded-xl border-2 border-dashed border-gray-400 text-gray-500 hover:bg-gray-300 hover:border-gray-500 transition cursor-pointer"
                >
                    <Icon name="plus" className="w-12 h-12 mb-2" />
                    <span className="font-semibold">Crear Nueva Serie</span>
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Crear Nueva Serie">
                <div className="space-y-4">
                    <input
                        type="text"
                        placeholder="Título de la serie"
                        value={newSeriesTitle}
                        onChange={(e) => setNewSeriesTitle(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <textarea
                        placeholder="Estilo de dibujo (ej: estilo manga, comic americano, etc.)"
                        value={newSeriesStyle}
                        onChange={(e) => setNewSeriesStyle(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        rows="3"
                    />
                    <button onClick={handleCreateSeries} className="w-full bg-indigo-500 text-white py-2 rounded-lg hover:bg-indigo-600 transition">
                        Crear Serie
                    </button>
                </div>
            </Modal>
        </div>
    );
};


// 3. Series Editor
const SeriesEditor = ({ seriesId, onBack, onSelectEpisode }) => {
    const [series, setSeries] = useState(null);
    const [characters, setCharacters] = useState([]);
    const [episodes, setEpisodes] = useState([]);
    const [loading, setLoading] = useState(true);

    const [isCharModalOpen, setIsCharModalOpen] = useState(false);
    const [isEpisodeModalOpen, setIsEpisodeModalOpen] = useState(false);
    const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
    const [editingChar, setEditingChar] = useState(null);
    const [newCharName, setNewCharName] = useState('');
    const [newCharDesc, setNewCharDesc] = useState('');
    const [newEpisodeTitle, setNewEpisodeTitle] = useState('');
    const [newSeriesStyle, setNewSeriesStyle] = useState('');
    const [isGeneratingCharImages, setIsGeneratingCharImages] = useState(null);
    const [selectedCharImages, setSelectedCharImages] = useState(new Set()); // Track selected images
    const [regeneratingCharId, setRegeneratingCharId] = useState(null); // Track which character is being regenerated
    const [regenerationGuide, setRegenerationGuide] = useState(''); // Guide text for regeneration

    useEffect(() => {
        if (!seriesId) return;

        const seriesDocPath = `/artifacts/${appId}/public/data/series`;
        const unsubSeries = onSnapshot(doc(db, seriesDocPath, seriesId), (doc) => {
            setSeries({ id: doc.id, ...doc.data() });
            setLoading(false);
        });

        const charactersCollectionPath = `/artifacts/${appId}/public/data/characters`;
        const qChars = query(collection(db, charactersCollectionPath), where("seriesId", "==", seriesId));
        const unsubChars = onSnapshot(qChars, async (snapshot) => {
            const newCharactersData = await Promise.all(snapshot.docs.map(async (d) => {
                const char = { id: d.id, ...d.data() };
                const imagesCollectionRef = collection(db, charactersCollectionPath, char.id, 'images');
                const imagesSnapshot = await getDocs(query(imagesCollectionRef));
                const imageUrls = imagesSnapshot.docs.map(doc => doc.data().imageUrl);
                return { ...char, imageUrls };
            }));
            setCharacters(newCharactersData);
        });

        const episodesCollectionPath = `/artifacts/${appId}/public/data/episodes`;
        const qEpisodes = query(collection(db, episodesCollectionPath), where("seriesId", "==", seriesId));
        const unsubEpisodes = onSnapshot(qEpisodes, (snapshot) => {
            const episodesData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            episodesData.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
                return dateA - dateB;
            });
            setEpisodes(episodesData);
        });

        return () => {
            unsubSeries();
            unsubChars();
            unsubEpisodes();
        };
    }, [seriesId]);

    const handleSaveCharacter = async () => {
        if (!newCharName.trim() || !newCharDesc.trim()) return;
        const charactersCollectionPath = `/artifacts/${appId}/public/data/characters`;
        const charData = {
            name: newCharName,
            description: newCharDesc,
            seriesId: seriesId,
        };

        closeCharModal(); // Close modal immediately for better UX
        
        let charId;
        if (editingChar) {
            charId = editingChar.id;
            await updateDoc(doc(db, charactersCollectionPath, charId), charData);
        } else {
            const docRef = await addDoc(collection(db, charactersCollectionPath), charData);
            charId = docRef.id;
        }

        setIsGeneratingCharImages(charId); // Start loading indicator for this character

        try {
            // Delete old images if editing
            if (editingChar) {
                const oldImagesQuery = query(collection(db, charactersCollectionPath, charId, 'images'));
                const oldImagesSnapshot = await getDocs(oldImagesQuery);
                await Promise.all(oldImagesSnapshot.docs.map(d => deleteDoc(d.ref)));
            }
            
            const prompts = [
                `Full body character concept art, clear background. Style: "${series.style}". Character: ${newCharDesc}, standing pose, neutral expression.`,
                `Character portrait, shoulders up. Style: "${series.style}". Character: ${newCharDesc}, smiling.`,
                `Character concept art, action pose. Style: "${series.style}". Character: ${newCharDesc}.`
            ];

            const imageUrls = await Promise.all(prompts.map(p => generateImage(p)));
            const validImageUrls = imageUrls.filter(url => url !== null);
            
            const compressedUrls = await Promise.all(validImageUrls.map(url => compressImage(url)));

            // Save new images to a subcollection
            const imagesCollectionRef = collection(db, charactersCollectionPath, charId, 'images');
            await Promise.all(compressedUrls.map(url => addDoc(imagesCollectionRef, { imageUrl: url })));
            
            // Trigger the listener to refresh data
            await updateDoc(doc(db, charactersCollectionPath, charId), { imagesUpdatedAt: new Date() });

        } catch (error) {
            console.error("Error generating character images:", error);
            alert("Hubo un error generando las imágenes del personaje.");
        } finally {
            setIsGeneratingCharImages(null); // Stop loading indicator
        }
    };

    const openCharModal = (char = null) => {
        setEditingChar(char);
        setNewCharName(char ? char.name : '');
        setNewCharDesc(char ? char.description : '');
        setIsCharModalOpen(true);
    };

    const closeCharModal = () => {
        setIsCharModalOpen(false);
        setEditingChar(null);
        setNewCharName('');
        setNewCharDesc('');
    };

    const deleteCharacter = async (charId) => {
        const charactersCollectionPath = `/artifacts/${appId}/public/data/characters`;
        const imagesQuery = query(collection(db, charactersCollectionPath, charId, 'images'));
        const imagesSnapshot = await getDocs(imagesQuery);
        
        const batch = writeBatch(db);
        imagesSnapshot.forEach(doc => batch.delete(doc.ref));
        batch.delete(doc(db, charactersCollectionPath, charId));
        
        await batch.commit();
    };
    
    const handleCreateEpisode = async () => {
        if (!newEpisodeTitle.trim()) return;
        const episodesCollectionPath = `/artifacts/${appId}/public/data/episodes`;
        await addDoc(collection(db, episodesCollectionPath), {
            title: newEpisodeTitle,
            seriesId: seriesId,
            createdAt: new Date(),
        });
        setNewEpisodeTitle('');
        setIsEpisodeModalOpen(false);
    };
    
    const regenerateCharacterImages = async (charId, onlyUnselected = false) => {
        const char = characters.find(c => c.id === charId);
        if (!char || !series) return;

        setIsGeneratingCharImages(charId);
        setRegeneratingCharId(charId);

        try {
            const charactersCollectionPath = `/artifacts/${appId}/public/data/characters`;

            // Get selected images for this character
            const selectedImagesForChar = Array.from(selectedCharImages)
                .filter(key => key.startsWith(`${charId}-`))
                .map(key => {
                    const index = parseInt(key.split('-')[1]);
                    return { index, url: char.imageUrls[index] };
                });

            // Delete old images if regenerating all
            if (!onlyUnselected) {
                const oldImagesQuery = query(collection(db, charactersCollectionPath, charId, 'images'));
                const oldImagesSnapshot = await getDocs(oldImagesQuery);
                await Promise.all(oldImagesSnapshot.docs.map(d => deleteDoc(d.ref)));
                selectedCharImages.clear(); // Clear all selections if regenerating all
            }

            const prompts = [
                `Full body character concept art, clear background. Style: "${series.style}". Character: ${char.description}, standing pose, neutral expression.`,
                `Character portrait, shoulders up. Style: "${series.style}". Character: ${char.description}, smiling.`,
                `Character concept art, action pose. Style: "${series.style}". Character: ${char.description}.`
            ];

            const newImageUrls = [];

            for (let i = 0; i < prompts.length; i++) {
                const imageKey = `${charId}-${i}`;
                const isSelected = selectedCharImages.has(imageKey);

                if (onlyUnselected && isSelected) {
                    // Keep the selected image
                    newImageUrls.push(char.imageUrls[i]);
                } else {
                    // Generate new image with selected images as reference and custom guide
                    const referenceUrls = selectedImagesForChar.map(img => img.url);
                    let newPrompt = `${prompts[i]} Use these reference images to maintain consistency with the character's appearance.`;

                    // Add custom regeneration guide if provided
                    if (regenerationGuide.trim()) {
                        newPrompt += ` Additional instructions: ${regenerationGuide.trim()}`;
                    }

                    const imageUrl = await generateImage(newPrompt, referenceUrls);
                    if (imageUrl) {
                        const compressedUrl = await compressImage(imageUrl);
                        newImageUrls.push(compressedUrl);
                    } else {
                        // Fallback to original if generation fails
                        newImageUrls.push(char.imageUrls[i] || null);
                    }
                }
            }

            // Save new images to database
            const imagesCollectionRef = collection(db, charactersCollectionPath, charId, 'images');
            const validUrls = newImageUrls.filter(url => url !== null);

            // Delete existing images first
            const existingImagesQuery = query(imagesCollectionRef);
            const existingImagesSnapshot = await getDocs(existingImagesQuery);
            await Promise.all(existingImagesSnapshot.docs.map(d => deleteDoc(d.ref)));

            // Add new images
            await Promise.all(validUrls.map(url => addDoc(imagesCollectionRef, { imageUrl: url })));

            // Trigger the listener to refresh data
            await updateDoc(doc(db, charactersCollectionPath, charId), { imagesUpdatedAt: new Date() });

        } catch (error) {
            console.error("Error regenerating character images:", error);
            alert("Hubo un error regenerando las imágenes del personaje.");
        } finally {
            setIsGeneratingCharImages(null);
            setRegeneratingCharId(null);
        }
    };

    const deleteEpisode = async (episodeId) => {
        const panelsCollectionPath = `/artifacts/${appId}/public/data/panels`;
        const episodesCollectionPath = `/artifacts/${appId}/public/data/episodes`;

        const panelsQuery = query(collection(db, panelsCollectionPath), where("episodeId", "==", episodeId));
        const panelDocs = await getDocs(panelsQuery);

        const batch = writeBatch(db);
        panelDocs.forEach(panelDoc => {
            batch.delete(panelDoc.ref);
        });
        batch.delete(doc(db, episodesCollectionPath, episodeId));

        await batch.commit();
    }

    if (loading || !series) return <div className="p-8"><LoadingSpinner /></div>;

    return (
        <div className="p-4 sm:p-8 bg-gray-50 min-h-screen">
            <header className="mb-8">
                <button onClick={onBack} className="flex items-center gap-2 text-indigo-500 hover:text-indigo-700 mb-4">
                    <Icon name="arrow-left" className="w-5 h-5"/> Volver a Series
                </button>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-800">{series.title}</h1>
                        <p className="text-lg text-gray-500 italic">"{series.style}"</p>
                    </div>
                    <button
                        onClick={() => {
                            setNewSeriesStyle(series.style);
                            setIsStyleModalOpen(true);
                        }}
                        className="flex items-center gap-2 bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition"
                    >
                        <Icon name="edit" className="w-5 h-5"/> Editar Estilo
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Characters Section */}
                <div className="bg-white p-6 rounded-xl shadow-md">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-semibold text-gray-700">Personajes</h2>
                        <button onClick={() => openCharModal()} className="flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition">
                           <Icon name="plus" className="w-5 h-5"/> Añadir
                        </button>
                    </div>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                        {characters.length === 0 && <p className="text-gray-500">Aún no hay personajes.</p>}
                        {characters.map(char => (
                            <div key={char.id} className="p-4 border rounded-lg bg-gray-50 flex flex-col">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 pr-2">
                                        <h3 className="font-bold text-gray-800">{char.name}</h3>
                                        <p className="text-sm text-gray-600">{char.description}</p>
                                    </div>
                                    <div className="flex gap-2 flex-shrink-0 ml-2">
                                        <button onClick={() => openCharModal(char)} className="text-gray-500 hover:text-blue-600"><Icon name="edit" className="w-5 h-5"/></button>
                                        <button onClick={() => deleteCharacter(char.id)} className="text-gray-500 hover:text-red-600"><Icon name="trash" className="w-5 h-5"/></button>
                                    </div>
                                </div>

                                {isGeneratingCharImages === char.id && (
                                    <div className="mt-4 text-center">
                                        <LoadingSpinner size="sm" />
                                        <p className="text-sm text-gray-500 animate-pulse">Generando imágenes...</p>
                                    </div>
                                )}

                                {char.imageUrls && char.imageUrls.length > 0 && (
                                    <div className="mt-4 space-y-3">
                                        <div className="grid grid-cols-3 gap-2">
                                            {char.imageUrls.map((url, index) => {
                                                const imageKey = `${char.id}-${index}`;
                                                const isSelected = selectedCharImages.has(imageKey);
                                                return (
                                                    <div key={index} className="relative">
                                                        <a href={url} target="_blank" rel="noopener noreferrer">
                                                            <img
                                                                src={url}
                                                                alt={`${char.name} portrait ${index + 1}`}
                                                                className={`w-full h-auto object-cover rounded-md bg-gray-200 aspect-square hover:scale-105 transition-transform ${isSelected ? 'ring-2 ring-green-500' : ''}`}
                                                            />
                                                        </a>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                const newSelected = new Set(selectedCharImages);
                                                                if (e.target.checked) {
                                                                    newSelected.add(imageKey);
                                                                } else {
                                                                    newSelected.delete(imageKey);
                                                                }
                                                                setSelectedCharImages(newSelected);
                                                            }}
                                                            className="absolute top-2 right-2 w-4 h-4 text-green-600 bg-white border-2 border-gray-300 rounded focus:ring-green-500"
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Campo de texto guía y botones de acción */}
                                        {selectedCharImages.size > 0 && (
                                            <div className="space-y-2">
                                                <textarea
                                                    value={regenerationGuide}
                                                    onChange={(e) => setRegenerationGuide(e.target.value)}
                                                    placeholder="Describe cómo mejorar las imágenes no seleccionadas (ej: 'haz las expresiones más expresivas', 'cambia el ángulo a algo más dinámico')..."
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                                    rows="2"
                                                />
                                                <div className="flex gap-2 justify-center">
                                                    <button
                                                        onClick={() => regenerateCharacterImages(char.id, false)}
                                                        disabled={isGeneratingCharImages === char.id}
                                                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-blue-300"
                                                    >
                                                        Regenerar Todo
                                                    </button>
                                                    <button
                                                        onClick={() => regenerateCharacterImages(char.id, true)}
                                                        disabled={isGeneratingCharImages === char.id}
                                                        className="px-3 py-1 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-green-300"
                                                    >
                                                        Regenerar Resto ({3 - selectedCharImages.size})
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Botón de regenerar todo (siempre visible) */}
                                        {selectedCharImages.size === 0 && (
                                            <div className="flex gap-2 justify-center">
                                                <button
                                                    onClick={() => regenerateCharacterImages(char.id, false)}
                                                    disabled={isGeneratingCharImages === char.id}
                                                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-blue-300"
                                                >
                                                    Regenerar Todo
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Episodes Section */}
                <div className="bg-white p-6 rounded-xl shadow-md">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-semibold text-gray-700">Episodios</h2>
                         <button onClick={() => setIsEpisodeModalOpen(true)} className="flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 transition">
                            <Icon name="plus" className="w-5 h-5"/> Añadir
                        </button>
                    </div>
                     <div className="space-y-3 max-h-96 overflow-y-auto">
                        {episodes.length === 0 && <p className="text-gray-500">Aún no hay episodios.</p>}
                        {episodes.map(ep => (
                            <div key={ep.id} className="p-4 border rounded-lg bg-gray-50 flex justify-between items-center group">
                                <span className="font-semibold text-gray-800">{ep.title}</span>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => onSelectEpisode(ep.id)} className="bg-green-500 text-white px-3 py-1 rounded-md text-sm hover:bg-green-600">Editar</button>
                                    <button onClick={() => deleteEpisode(ep.id)} className="text-gray-500 hover:text-red-600"><Icon name="trash" className="w-5 h-5"/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <Modal isOpen={isCharModalOpen} onClose={closeCharModal} title={editingChar ? "Editar Personaje" : "Nuevo Personaje"}>
                 <div className="space-y-4">
                    <input type="text" placeholder="Nombre del personaje" value={newCharName} onChange={(e) => setNewCharName(e.target.value)} className="w-full px-4 py-2 border rounded-lg"/>
                    <textarea placeholder="Descripción física y de personalidad" value={newCharDesc} onChange={(e) => setNewCharDesc(e.target.value)} className="w-full px-4 py-2 border rounded-lg" rows="4"/>
                    <button onClick={handleSaveCharacter} className="w-full bg-indigo-500 text-white py-2 rounded-lg hover:bg-indigo-600 transition">Guardar y Generar Imágenes</button>
                </div>
            </Modal>
             <Modal isOpen={isEpisodeModalOpen} onClose={() => setIsEpisodeModalOpen(false)} title="Nuevo Episodio">
                <div className="space-y-4">
                    <input type="text" placeholder="Título del episodio" value={newEpisodeTitle} onChange={(e) => setNewEpisodeTitle(e.target.value)} className="w-full px-4 py-2 border rounded-lg"/>
                    <button onClick={handleCreateEpisode} className="w-full bg-indigo-500 text-white py-2 rounded-lg hover:bg-indigo-600 transition">Crear Episodio</button>
                </div>
            </Modal>

            <Modal isOpen={isStyleModalOpen} onClose={() => setIsStyleModalOpen(false)} title="Editar Estilo de la Serie">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Estilo artístico
                        </label>
                        <textarea
                            value={newSeriesStyle}
                            onChange={(e) => setNewSeriesStyle(e.target.value)}
                            placeholder="Describe el estilo artístico de la serie (ej: estilo manga, comic americano, etc.)"
                            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
                            rows="3"
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={async () => {
                                if (!newSeriesStyle.trim()) return;
                                try {
                                    const seriesDocPath = `/artifacts/${appId}/public/data/series`;
                                    await updateDoc(doc(db, seriesDocPath, seriesId), {
                                        style: newSeriesStyle.trim()
                                    });
                                    setIsStyleModalOpen(false);
                                    alert('Estilo actualizado correctamente');
                                } catch (error) {
                                    console.error('Error updating series style:', error);
                                    alert('Error al actualizar el estilo');
                                }
                            }}
                            className="flex-1 bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition"
                        >
                            Guardar Cambios
                        </button>
                        <button
                            onClick={() => setIsStyleModalOpen(false)}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};


// 4. Episode Editor
const EpisodeEditor = ({ seriesId, episodeId, onBack }) => {
    const [series, setSeries] = useState(null);
    const [episode, setEpisode] = useState(null);
    const [characters, setCharacters] = useState([]);
    const [panels, setPanels] = useState([]);
    const [loading, setLoading] = useState(true);

    const [scene, setScene] = useState('');
    const [dialogue, setDialogue] = useState('');
    const [selectedChars, setSelectedChars] = useState(new Set());
    const [isGenerating, setIsGenerating] = useState(false);
    const [editingPanel, setEditingPanel] = useState(null);
    const [retryStatus, setRetryStatus] = useState(null); // { attempt, maxRetries, delay }
    
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const shareLink = `${window.location.origin}${window.location.pathname}?view=${episodeId}`;

    useEffect(() => {
        if (!seriesId || !episodeId) return;

        let active = true;

        const fetchData = async () => {
            setLoading(true);
            
            const seriesDocPath = `/artifacts/${appId}/public/data/series`;
            const seriesDoc = await getDoc(doc(db, seriesDocPath, seriesId));
            if (active) setSeries({ id: seriesDoc.id, ...seriesDoc.data() });

            const episodeDocPath = `/artifacts/${appId}/public/data/episodes`;
            const episodeDoc = await getDoc(doc(db, episodeDocPath, episodeId));
            if (active) setEpisode({ id: episodeDoc.id, ...episodeDoc.data() });
            
            const charactersCollectionPath = `/artifacts/${appId}/public/data/characters`;
            const qChars = query(collection(db, charactersCollectionPath), where("seriesId", "==", seriesId));
            const charDocs = await getDocs(qChars);
            if(active) {
                 const charactersData = await Promise.all(charDocs.docs.map(async (d) => {
                    const char = { id: d.id, ...d.data() };
                    const imagesCollectionRef = collection(db, charactersCollectionPath, char.id, 'images');
                    const imagesSnapshot = await getDocs(query(imagesCollectionRef));
                    const imageUrls = imagesSnapshot.docs.map(doc => doc.data().imageUrl);
                    return { ...char, imageUrls };
                }));
                setCharacters(charactersData);
            }
        };

        fetchData();
        
        const panelsCollectionPath = `/artifacts/${appId}/public/data/panels`;
        const qPanels = query(collection(db, panelsCollectionPath), where("episodeId", "==", episodeId));
        const unsubPanels = onSnapshot(qPanels, (snapshot) => {
            if (active) {
                const panelData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                panelData.sort((a,b) => a.order - b.order);
                setPanels(panelData);
                setLoading(false);
            }
        });
        
        return () => { 
            active = false;
            unsubPanels();
        };

    }, [seriesId, episodeId]);

    const handleCharToggle = (charId) => {
        setSelectedChars(prev => {
            const newSet = new Set(prev);
            if (newSet.has(charId)) {
                newSet.delete(charId);
            } else {
                newSet.add(charId);
            }
            return newSet;
        });
    };

    const handleStartEdit = (panel) => {
        setEditingPanel(panel);
        setScene(panel.sceneDescription);
        setDialogue(panel.dialogue);
        setSelectedChars(new Set(panel.characterIds || []));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingPanel(null);
        setScene('');
        setDialogue('');
        setSelectedChars(new Set());
    };

    const handleSavePanel = async () => {
        if (!scene.trim() || !series || !episode) {
            alert("La descripción de la escena es necesaria.");
            return;
        }
        setIsGenerating(true);

        const panelCharacters = characters.filter(c => selectedChars.has(c.id));
        const characterImageUrls = panelCharacters.flatMap(c => c.imageUrls || []);
        
        let previousPanelContextUrls = [];
        if (editingPanel) {
            // When editing, get the two panels that came *before* the one being edited.
            const editIndex = panels.findIndex(p => p.id === editingPanel.id);
            if (editIndex > 0) {
                previousPanelContextUrls = panels.slice(Math.max(0, editIndex - 2), editIndex).map(p => p.imageUrl);
            }
        } else {
            // When creating a new panel, take the last two panels from the whole list.
            previousPanelContextUrls = panels.slice(-2).map(p => p.imageUrl);
        }

        const allReferenceUrls = [...characterImageUrls, ...previousPanelContextUrls];

        let characterDescriptions;
        if (panelCharacters.length > 0) {
            characterDescriptions = `The scene must include ONLY the following characters: ${panelCharacters.map(c => `${c.name}: ${c.description}`).join('. ')}`;
        } else {
            characterDescriptions = "The scene must contain NO characters. Focus only on the environment and setting described.";
        }

        const prompt = `Comic book panel in the style of: "${series.style}".
        Generate this image in 16:9 aspect ratio (widescreen format, horizontal layout).
        The composition should be optimized for 16:9 viewing with proper horizontal framing.
        ${characterDescriptions}
        Use the provided images as a strong reference for the characters' appearance and the scene's continuity from previous panels.
        Scene description: ${scene}.
        Dialogue: "${dialogue}".
        The image should focus on the action and characters described in the scene, framed appropriately for widescreen display.`;

        const imageUrl = await generateImage(prompt, allReferenceUrls);
        
        if (imageUrl) {
            const compressedImageUrl = await compressImage(imageUrl);
            const panelData = {
                episodeId,
                sceneDescription: scene,
                dialogue,
                characterIds: Array.from(selectedChars),
                imageUrl: compressedImageUrl,
            };

            const panelsCollectionPath = `/artifacts/${appId}/public/data/panels`;

            if (editingPanel) {
                const panelRef = doc(db, panelsCollectionPath, editingPanel.id);
                await updateDoc(panelRef, panelData);
            } else {
                await addDoc(collection(db, panelsCollectionPath), {
                    ...panelData,
                    order: panels.length,
                    createdAt: new Date(),
                });
            }
            handleCancelEdit();
        } else {
            alert("Hubo un error generando la imagen. Inténtalo de nuevo.");
        }

        setIsGenerating(false);
    };
    
    const deletePanel = async (panelIdToDelete) => {
        const panelsCollectionPath = `/artifacts/${appId}/public/data/panels`;
        
        const panelsSorted = [...panels].sort((a, b) => a.order - b.order);
        const remainingPanels = panelsSorted.filter(p => p.id !== panelIdToDelete);

        try {
            const batch = writeBatch(db);

            const panelToDeleteRef = doc(db, panelsCollectionPath, panelIdToDelete);
            batch.delete(panelToDeleteRef);

            remainingPanels.forEach((panel, index) => {
                if (panel.order !== index) {
                    const panelRef = doc(db, panelsCollectionPath, panel.id);
                    batch.update(panelRef, { order: index });
                }
            });

            await batch.commit();
        } catch (error) {
            console.error("Failed to delete panel and reorder:", error);
            alert("No se pudo eliminar el panel. Inténtalo de nuevo.");
        }
    };
    
    const copyToClipboard = () => {
        const textArea = document.createElement("textarea");
        textArea.value = shareLink;
        
        // Avoid scrolling to bottom
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                alert('Enlace copiado al portapapeles!');
            } else {
                alert('No se pudo copiar el enlace.');
            }
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
            alert('No se pudo copiar el enlace.');
        }

        document.body.removeChild(textArea);
    }

    if (loading || !series || !episode) return <div className="p-8"><LoadingSpinner /></div>;

    return (
        <div className="p-4 sm:p-8 bg-gray-50 min-h-screen">
             <header className="mb-8">
                <button onClick={onBack} className="flex items-center gap-2 text-indigo-500 hover:text-indigo-700 mb-4">
                    <Icon name="arrow-left" className="w-5 h-5"/> Volver a la Serie
                </button>
                 <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-800">{episode.title}</h1>
                        <p className="text-lg text-gray-500">de "{series.title}"</p>
                    </div>
                    <button onClick={() => setIsShareModalOpen(true)} className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition">
                        <Icon name="share" className="w-5 h-5"/> Compartir
                    </button>
                 </div>
            </header>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Panel Creator */}
                <div className="lg:w-1/3 bg-white p-6 rounded-xl shadow-md self-start sticky top-8">
                    <h2 className="text-2xl font-semibold text-gray-700 mb-4">{editingPanel ? 'Editar Panel' : 'Nuevo Panel'}</h2>
                    <div className="space-y-4">
                        <textarea value={scene} onChange={(e) => setScene(e.target.value)} placeholder="Describe la escena y la acción..." className="w-full p-2 border rounded-md" rows="4"/>
                        <textarea value={dialogue} onChange={(e) => setDialogue(e.target.value)} placeholder="Diálogo o texto (opcional)" className="w-full p-2 border rounded-md" rows="2"/>

                        {/* Indicación de precisión del texto generado */}
                        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <Icon name="info" className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-700">
                                <p className="font-medium mb-1">💡 Sobre el texto generado</p>
                                <p>El texto generado por IA puede requerir revisión para asegurar precisión gramatical, consistencia narrativa y adecuación al contexto. Te recomendamos revisar y editar el contenido antes de finalizar.</p>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-semibold mb-2">Personajes en escena:</h3>
                            <div className="flex flex-wrap gap-2">
                                {characters.map(char => (
                                    <button
                                        key={char.id}
                                        onClick={() => handleCharToggle(char.id)}
                                        className={`px-3 py-1 rounded-full text-sm ${selectedChars.has(char.id) ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                                    >
                                        {char.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                           <button 
                                onClick={handleSavePanel} 
                                disabled={isGenerating}
                                className="w-full bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 transition disabled:bg-green-300 flex items-center justify-center gap-2"
                            >
                                {isGenerating ? <LoadingSpinner size="sm"/> : <Icon name="wand" className="w-5 h-5"/>}
                                {isGenerating ? (editingPanel ? 'Regenerando...' : 'Generando...') : (editingPanel ? 'Regenerar Panel' : 'Generar Panel')}
                            </button>
                            {editingPanel && (
                                <button onClick={handleCancelEdit} className="w-full bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition">
                                    Cancelar Edición
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Panels Display */}
                <div className="lg:w-2/3 space-y-4">
                     {panels.length === 0 && !loading && (
                        <div className="text-center py-16 bg-white rounded-xl shadow-md">
                            <Icon name="image" className="w-16 h-16 text-gray-300 mx-auto mb-4"/>
                            <h3 className="text-xl font-semibold text-gray-600">Este episodio está vacío</h3>
                            <p className="text-gray-400">Usa el formulario para crear tu primer panel.</p>
                        </div>
                     )}
                     {panels.map((panel, index) => (
                        <div key={panel.id} className="bg-white p-4 rounded-xl shadow-md group relative">
                            <p className="font-bold text-gray-400 mb-2">Panel {index + 1}</p>
                            <div className="aspect-w-4 aspect-h-3 bg-gray-200 rounded-lg overflow-hidden">
                                <img src={panel.imageUrl} alt={panel.sceneDescription} className="w-full h-full object-contain"/>
                            </div>
                            <div className="mt-4">
                                {panel.dialogue && <p className="p-3 bg-gray-100 rounded-lg italic">"{panel.dialogue}"</p>}
                                <p className="text-sm text-gray-500 mt-2">{panel.sceneDescription}</p>
                            </div>
                             <div className="absolute top-4 right-4 flex gap-2">
                                <button onClick={() => handleStartEdit(panel)} className="bg-blue-500 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Icon name="edit" className="w-5 h-5"/>
                                </button>
                                <button onClick={() => deletePanel(panel.id)} className="bg-red-500 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Icon name="trash" className="w-5 h-5"/>
                                </button>
                            </div>
                        </div>
                     ))}
                </div>
            </div>
            
            <Modal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} title="Compartir Episodio">
                <p className="text-gray-600 mb-4">Cualquiera con este enlace podrá ver el episodio sin iniciar sesión.</p>
                <div className="flex items-center gap-2">
                    <input type="text" readOnly value={shareLink} className="w-full bg-gray-100 px-3 py-2 border rounded-lg"/>
                    <button onClick={copyToClipboard} className="bg-indigo-500 text-white p-2 rounded-lg hover:bg-indigo-600">
                        <Icon name="copy" className="w-5 h-5"/>
                    </button>
                </div>
            </Modal>
        </div>
    );
};


// 5. Public Viewer
const PublicViewer = ({ episodeId }) => {
    const [episode, setEpisode] = useState(null);
    const [panels, setPanels] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!episodeId) return;
        
        const fetchEpisodeData = async () => {
            setLoading(true);
            const episodeDocPath = `/artifacts/${appId}/public/data/episodes`;
            const episodeDoc = await getDoc(doc(db, episodeDocPath, episodeId));
            if (episodeDoc.exists()) {
                const episodeData = episodeDoc.data();
                setEpisode(episodeData);

                // Fetch series to show title
                const seriesDocPath = `/artifacts/${appId}/public/data/series`;
                const seriesDoc = await getDoc(doc(db, seriesDocPath, episodeData.seriesId));
                if (seriesDoc.exists()) {
                    setEpisode(prev => ({ ...prev, seriesTitle: seriesDoc.data().title }));
                }

                const panelsCollectionPath = `/artifacts/${appId}/public/data/panels`;
                const qPanels = query(collection(db, panelsCollectionPath), where("episodeId", "==", episodeId));
                const panelDocs = await getDocs(qPanels);
                const panelData = panelDocs.docs.map(d => ({ id: d.id, ...d.data() }));
                panelData.sort((a, b) => a.order - b.order);
                setPanels(panelData);
            } else {
                console.error("Episode not found");
            }
            setLoading(false);
        };

        fetchEpisodeData();
    }, [episodeId]);

    const observer = useRef();
    const lastPanelElementRef = useCallback(node => {
        // This is a placeholder for infinite scroll logic if needed in the future
        if (loading) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                // Here you would load more panels if the comic was very long
            }
        });
        if (node) observer.current.observe(node);
    }, [loading]);


    if (loading) return <div className="min-h-screen flex justify-center items-center"><LoadingSpinner size="lg" /></div>;

    if (!episode) return <div className="text-center p-8">Episodio no encontrado.</div>;

    return (
        <div className="bg-gray-800 text-white min-h-screen">
            <header className="bg-gray-900 p-4 text-center sticky top-0 z-10 shadow-lg">
                <h1 className="text-3xl font-bold">{episode.title}</h1>
                <p className="text-lg text-gray-400">de "{episode.seriesTitle}"</p>
            </header>
            <main className="max-w-3xl mx-auto p-4 md:p-8">
                <div className="space-y-8">
                    {panels.map((panel, index) => {
                        const isLast = index === panels.length - 1;
                        return (
                            <div ref={isLast ? lastPanelElementRef : null} key={panel.id} className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                                <img
                                  src={panel.imageUrl}
                                  alt={panel.sceneDescription}
                                  loading="lazy" // Native lazy loading
                                  className="w-full h-auto bg-gray-700"
                                />
                            </div>
                        )
                    })}
                </div>
            </main>
            <footer className="text-center p-8 text-gray-500">
                Fin del episodio.
            </footer>
        </div>
    );
};


// --- Login Component ---
const Login = ({ onLogin }) => {
    const [email, setEmail] = useState('njmery@gmail.com');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            onLogin();
        } catch (error) {
            console.error("Login error:", error);
            setError("Credenciales incorrectas. Verifica tu email y contraseña.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-800">Comic AI Editor</h1>
                    <p className="text-gray-600 mt-2">Inicia sesión para continuar</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="tu@email.com"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                            Contraseña
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="Tu contraseña"
                            required
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition disabled:bg-indigo-400 flex items-center justify-center gap-2"
                    >
                        {isLoading ? <LoadingSpinner size="sm" /> : null}
                        {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                    </button>
                </form>
            </div>
        </div>
    );
};

// --- Main App Component ---
function App() {
    const { user, loading } = useAuth();
    const [view, setView] = useState('dashboard'); // dashboard, series, episode
    const [selectedSeriesId, setSelectedSeriesId] = useState(null);
    const [selectedEpisodeId, setSelectedEpisodeId] = useState(null);

    // Check for public view URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const publicViewEpisodeId = urlParams.get('view');

    if (publicViewEpisodeId) {
        return <PublicViewer episodeId={publicViewEpisodeId} />;
    }

    if (loading) {
        return <div className="w-screen h-screen flex items-center justify-center"><LoadingSpinner size="lg" /></div>;
    }

    if (!user) {
        return <Login onLogin={() => {}} />;
    }
    
    const handleSelectSeries = (seriesId) => {
        setSelectedSeriesId(seriesId);
        setView('series');
    };
    
    const handleSelectEpisode = (episodeId) => {
        setSelectedEpisodeId(episodeId);
        setView('episode');
    };

    const navigateBack = () => {
        if (view === 'episode') {
            setView('series');
            setSelectedEpisodeId(null);
        } else if (view === 'series') {
            setView('dashboard');
            setSelectedSeriesId(null);
        }
    };

    const renderContent = () => {
        switch (view) {
            case 'series':
                return <SeriesEditor seriesId={selectedSeriesId} onBack={navigateBack} onSelectEpisode={handleSelectEpisode} />;
            case 'episode':
                return <EpisodeEditor seriesId={selectedSeriesId} episodeId={selectedEpisodeId} onBack={navigateBack} />;
            case 'dashboard':
            default:
                return <Dashboard user={user} onSelectSeries={handleSelectSeries} />;
        }
    };
    
    return (
        <div>
            {renderContent()}
        </div>
    );
}

export default App;
