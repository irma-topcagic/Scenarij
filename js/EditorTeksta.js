function EditorTeksta(divRef) {
    if (!divRef) {
        throw new Error("Pogresan tip elementa!");
    }
    if ( divRef.tagName !== 'DIV') throw new Error("Pogresan tip elementa!");
    if (divRef.getAttribute('contenteditable') !== 'true') throw new Error("Neispravan DIV, ne posjeduje contenteditable atribut!");

    function imaBold(node) {
        while (node && node !== divRef) {
            if (node.nodeType === 1) {
                const n = node.nodeName.toLowerCase();
                if (n === 'b' || n === 'strong') return true;
                const fw = node.style && node.style.fontWeight;
                if (fw === 'bold' || +fw >= 700) return true;
            }
            node = node.parentNode;
        }
        return false;
    }
    function imaItalic(node) {
        while (node && node !== divRef) {
            if (node.nodeType === 1) {
                const n = node.nodeName.toLowerCase();
                if (n === 'i' || n === 'em') return true;
                const fs = node.style && node.style.fontStyle;
                if (fs === 'italic') return true;
            }
            node = node.parentNode;
        }
        return false;
    }

    function separator(ch) {
        return ch === ' ' || ch === '\n' || ch === '\t'  || ch === '\r' || ch === ',' || ch === '.';
    }
    const slova= /[A-Za-zčćžšđČĆŽŠĐ]+/;

    let dajBrojRijeci = function () {
        let walker = document.createTreeWalker(divRef, NodeFilter.SHOW_TEXT, null, false);
        let chars = [];
        let node;
       while (node = walker.nextNode()) {
    let text = node.nodeValue;
    const jeBold = imaBold(node);      
    const jeItalic = imaItalic(node);  
    
    for (let i = 0; i < text.length; i++) {
        chars.push({ ch: text[i], bold: jeBold, italic: jeItalic });
    }
}
        let ukupno = 0, boldiranih = 0, italic = 0;
        let uRijeci = false, trenutniImaSlovo = false, sviBold = true, sviItalic = true;
        for (let i = 0; i <= chars.length; i++) {
            const cobj = chars[i] || { ch: ' ', bold: false, italic: false };
            const c = cobj.ch;
            if (!separator(c)) {
                if (!uRijeci) {
                    uRijeci = true;  trenutniImaSlovo = false; sviBold = cobj.bold; sviItalic = cobj.italic;
                } else {
                    sviBold = sviBold && cobj.bold; sviItalic = sviItalic && cobj.italic;
                }
                
                if (slova.test(c)) trenutniImaSlovo = true;
            } else {
                if (uRijeci) {
                    
                    if ( trenutniImaSlovo) {
                        ukupno++;
                        if (sviBold) boldiranih++;
                        if (sviItalic) italic++;
                    }
                    uRijeci = false; trenutniImaSlovo = false; sviBold = true; sviItalic = true;
                }
            }
        }
        return { ukupno: ukupno, boldiranih: boldiranih, italic: italic };
    };

    let getLines = function () {
    const txt = divRef.innerText.replace(/\r/g, '');
    return txt.split('\n').map(l => l.replace(/\u00A0/g, ' ')); 
    };

    function velikaSlova(line) {
        if (!line) return false;
    const s = line.trim();
    if (s.length === 0) return false;
    if (!/[A-ZČĆŽŠĐ]/.test(s)) return false;
    if (/[^A-ZČĆŽŠĐ ]/.test(s)) return false;
    return true;
    }

    function jeNaslovScene(line) {
        if (!line) return false;
        const s = line.trim();
        const m = s.match(/^(INT\.|EXT\.)\s*.*-\s*(DAY|NIGHT|AFTERNOON|MORNING|EVENING)$/);
        return !!m;
    }

    function uZagradama(line) {
    if (!line) return false;
    return /^\([^()]*\)$/.test(line.trim());
    }


    let dajUloge = function () {
        const lines = getLines();
        const roles = [];
        const seen = new Set();
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (velikaSlova(line) && !jeNaslovScene(line)) {
                let j = i + 1;
                let hasSpeech = false;
                while (j < lines.length) {
                    const nxt = lines[j].trim();
                    if (nxt === '') { j++; continue; }
                    if (uZagradama(nxt)) { j++; continue; }
                    if (velikaSlova(nxt) || jeNaslovScene(nxt)) break;
                    hasSpeech = true;
                    break;
                }
                if (hasSpeech && !seen.has(line)) {
                    roles.push(line);
                    seen.add(line);
                }
            }
        }
        return roles;
    };

    function levenshtein(a, b) {
        const m = a.length, n = b.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
            }
        }
        return dp[m][n];
    }

    let pogresnaUloga = function () {
    const roles = dajUloge();
    if (!roles || roles.length === 0) return [];
    
    
    const counts = {};
    for (const r of roles) counts[r] = 0;
    
    // broj pojavljivanja
    const lines = getLines();
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (roles.includes(trimmed)) {
            counts[trimmed]++;  
        }
    }
    
    // potencijalno pogrešne uloge
    const result = new Set();
    for (let i = 0; i < roles.length; i++) {
        for (let j = 0; j < roles.length; j++) {
            if (i === j) continue;
            
            const A = roles[i];
            const B = roles[j];
            const dist = levenshtein(A, B);
            const allowed = (A.length > 5 && B.length > 5) ? 2 : 1;
            
            if (dist <= allowed) {
                const countA = counts[A];  
                const countB = counts[B];  
                
                if (countB >= 4 && (countB - countA) >= 3) {
                    result.add(A);
                }
            }
        }
    }
    
    
    return roles.filter(r => result.has(r));
};

    function buildScenes() {
        const lines = getLines();
        const scenes = [];
        let current = { title: null, lines: [] };
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (jeNaslovScene(line.trim())) {
                if (current.title !== null || current.lines.length > 0) scenes.push(current);
                current = { title: line.trim(), lines: [] };
            } else {
                current.lines.push(line);
            }
        }
        if (current.title !== null || current.lines.length > 0) {
               scenes.push(current);
           }
        return scenes;
    }

    function parseReplicas(scene) {
    const L = scene.lines;
    const replicas = [];
    
    for (let i = 0; i < L.length;) {
        const raw = L[i];
        const line = raw.trim();
        
        
        if (velikaSlova(line) && !jeNaslovScene(line)) {
            let next = i + 1;
            let hasSpeech = false;
            while (next < L.length) {
                const nxt = L[next].trim();
                if (nxt === '') { next++; continue; }
                if (uZagradama(nxt)) { next++; continue; }
                if (velikaSlova(nxt) || jeNaslovScene(nxt)) break;
                hasSpeech = true;
                break;
            }
            
            if (hasSpeech) {
                
                const roleName = line;
                let j = i + 1;
                const block = [];
                
                while (j < L.length) {
                    const curTrim = L[j].trim();
                    
                    if (velikaSlova(curTrim) || jeNaslovScene(curTrim)) break;
                    
                    
                    if (uZagradama(curTrim)) {
                        j++;
                        continue;
                    }
                    
                    if (curTrim === '') {
                        let k = j + 1;
                        let foundContinuation = false;
                        
                        while (k < L.length) {
                            const ahead = L[k].trim();
                            
                            
                            if (ahead === '') {
                                k++;
                                continue;
                            }
                            
                            
                            if (uZagradama(ahead)) {
                                k++;
                                continue;
                            }
                            if (velikaSlova(ahead) || jeNaslovScene(ahead)) {
                                break;
                            }
                            foundContinuation = true;
                            break;
                        }
                        
                        if (!foundContinuation) {break;}
                        j++;
                        continue;
                    }
                    block.push(L[j]);
                    j++;
                }
                
                replicas.push({ uloga: roleName, linije: block });
                i = j;
            } else {
                
                replicas.push({ action: true, text: line });
                i++;
            }
        }
        
        else if (line === '' || uZagradama(line)) {
            i++;
        }
        
        else {
            let j = i;
            const actionLines = [];
            
            while (j < L.length) {
                const t = L[j].trim();
                
                
                if (t === '') {
                    j++;
                    break;
                }
                
                
                if (velikaSlova(t) || jeNaslovScene(t)) break;
                
                
                if (uZagradama(t)) {
                    j++;
                    continue;
                }
                
                actionLines.push(L[j]);
                j++;
            }
            
            if (actionLines.length > 0) {
                replicas.push({ action: true, text: actionLines.join('\n') });
            }
            i = j;
        }
    }
    
    return replicas;
}
    let brojLinijaTeksta = function (uloga) { 
        if (!uloga || typeof uloga !== 'string') return 0; 
        const target = uloga.toUpperCase(); 
        const scenes = buildScenes(); 
        let total = 0; 
        for (const s of scenes) { 
            const reps = parseReplicas(s); 
            for (const r of reps) { if (r.action) continue; 
                if (r.uloga.toUpperCase() === target) { 
                    total += r.linije.filter(l => l && l.trim() !== '' && !uZagradama(l.trim())).length; } } }
         return total; };

    let scenarijUloge = function (uloga) {
        if (!uloga || typeof uloga !== 'string') return [];
        const target = uloga.toUpperCase();
        const scenes = buildScenes();
        const result = [];
        for (const s of scenes) {
            const reps = parseReplicas(s);
            let posCounter = 0;
            for (let idx = 0; idx < reps.length; idx++) {
                const item = reps[idx];
                if (item.action) continue;
                posCounter++;
                if (item.uloga.toUpperCase() === target) {
                    let prev = null;
                    if (idx - 1 >= 0 && !reps[idx - 1].action) {
                        prev = { uloga: reps[idx - 1].uloga, linije: reps[idx - 1].linije };
                    }
                    let next = null;
                    if (idx + 1 < reps.length && !reps[idx + 1].action) {
                        next = { uloga: reps[idx + 1].uloga, linije: reps[idx + 1].linije };
                    }
                    result.push({
                        scena: s.title || '',
                        pozicijaUTekstu: posCounter,
                        prethodni: prev,
                        trenutni: { uloga: item.uloga, linije: item.linije },
                        sljedeci: next
                    });
                }
            }
        }
        return result;
    };

     let grupisiUloge = function () {
    const scenes = buildScenes();
    const groups = [];
    for (const s of scenes) {
        const reps = parseReplicas(s);
        let i = 0;
        let segmentNum = 0;
        while (i < reps.length) {
            if (reps[i].action) { i++; continue; } 
            segmentNum++;
            const seen = new Set();
            const order = [];
            while (i < reps.length && !reps[i].action) {
                const r = reps[i];
                if (!seen.has(r.uloga)) { order.push(r.uloga); seen.add(r.uloga); }
                i++;
            }
            if (order.length > 0) {
                groups.push({ scena: s.title || '', segment: segmentNum, uloge: order });
            }
        }
    }
    return groups;
   };


   let formatirajTekst = function(komanda) {
    if (!['bold', 'italic', 'underline'].includes(komanda)) return false;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;

    const range = sel.getRangeAt(0);
    let common = range.commonAncestorContainer;

    
    if (common.nodeType === 3) common = common.parentNode;

   
    let node = common;
    let inside = false;
    while (node) {
        if (node === divRef) {
            inside = true;
            break;
        }
        node = node.parentNode;
    }
    if (!inside) return false;

    
    const commandState = document.queryCommandState(komanda);

    
    document.execCommand(komanda, false, null);

    
    const formatTags = { bold: 'B', italic: 'I', underline: 'U' };
    const tag = formatTags[komanda];

    const elements = divRef.querySelectorAll(tag);
    elements.forEach(el => {
        
        if (el.parentNode && el.parentNode.tagName === tag) {
            while (el.firstChild) {
                el.parentNode.insertBefore(el.firstChild, el);
            }
            el.parentNode.removeChild(el);
        }
    });

    return true;
};

    return {
        dajBrojRijeci,
        dajUloge,
        pogresnaUloga,
        brojLinijaTeksta,
        scenarijUloge,
        grupisiUloge,
        formatirajTekst
    };
};
