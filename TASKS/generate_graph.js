const fs = require('fs');

const content = fs.readFileSync('0. TASK_LIST.md', 'utf-8');
const lines = content.split('\n');

const tasks = [];
const taskSet = new Set();

for (let line of lines) {
    if (line.trim().startsWith('| **')) {
        const parts = line.split('|').map(s => s.trim());
        if (parts.length >= 7) {
            let idMatch = parts[1].match(/\*\*(.+?)\*\*/);
            if (!idMatch) continue;
            let id = idMatch[1];
            // Only parse if it looks like a valid ID
            if (!id.match(/^[A-Z]+-[A-Z0-9]+-[0-9]+$/)) continue;

            let title = parts[3].replace(/"/g, "'");
            let depsRaw = parts[5];
            
            let deps = [];
            if (depsRaw && depsRaw !== 'None') {
                // Split by comma or dot or ampersand
                let depParts = depsRaw.split(/[,·&]/).map(s => s.trim());
                for (let dep of depParts) {
                    if (dep.includes('~')) {
                        let match = dep.match(/([A-Z]+-[A-Z0-9]+-)(\d+)~(\d+)/);
                        if (match) {
                            let prefix = match[1];
                            let start = parseInt(match[2], 10);
                            let end = parseInt(match[3], 10);
                            for (let i = start; i <= end; i++) {
                                let padded = String(i).padStart(match[2].length, '0');
                                deps.push(`${prefix}${padded}`);
                            }
                        }
                    } else {
                        let idMatches = dep.match(/[A-Z]+-[A-Z0-9]+-[0-9]+/g);
                        if (idMatches) {
                            deps.push(...idMatches);
                        }
                    }
                }
            }
            tasks.push({ id, title, deps, group: getGroup(id) });
            taskSet.add(id);
        }
    }
}

function getGroup(id) {
    if (id.startsWith('CT-DB')) return 'DB';
    if (id.startsWith('CT-API')) return 'API';
    if (id.startsWith('CT-MOCK')) return 'MOCK';
    if (id.startsWith('FW-')) return 'WRITE';
    if (id.startsWith('FR-')) return 'READ';
    if (id.startsWith('TS-')) return 'TEST';
    if (id.startsWith('IF-')) return 'INFRA';
    if (id.startsWith('NF-')) return 'NON_FUNC';
    return 'OTHER';
}

let mermaid = `\`\`\`mermaid
graph TD
    classDef DB fill:#2c5282,stroke:#3182ce,color:#fff;
    classDef API fill:#276749,stroke:#38a169,color:#fff;
    classDef MOCK fill:#2f855a,stroke:#38a169,color:#fff;
    classDef WRITE fill:#744210,stroke:#d69e2e,color:#fff;
    classDef READ fill:#b7791f,stroke:#d69e2e,color:#fff;
    classDef TEST fill:#97266d,stroke:#d53f8c,color:#fff;
    classDef INFRA fill:#2d3748,stroke:#4a5568,color:#fff;
    classDef NON_FUNC fill:#c53030,stroke:#e53e3e,color:#fff;

`;

let subgraphs = {
    'DB': [], 'API': [], 'MOCK': [], 'WRITE': [], 'READ': [], 'TEST': [], 'INFRA': [], 'NON_FUNC': [], 'OTHER': []
};

for (let t of tasks) {
    let safeId = t.id.replace(/-/g, '_');
    let safeTitle = t.title.replace(/\[|\]|\(|\)|"/g, '').substring(0, 40);
    subgraphs[t.group].push(`        ${safeId}["${t.id}: ${safeTitle}"]:::${t.group}`);
}

for (let group in subgraphs) {
    if (subgraphs[group].length > 0) {
        mermaid += `    subgraph ${group}\n`;
        mermaid += subgraphs[group].join('\n') + '\n';
        mermaid += `    end\n\n`;
    }
}

let edgesAdded = 0;
for (let t of tasks) {
    let safeId = t.id.replace(/-/g, '_');
    for (let dep of t.deps) {
        if (taskSet.has(dep)) {
            let safeDep = dep.replace(/-/g, '_');
            mermaid += `    ${safeDep} --> ${safeId}\n`;
            edgesAdded++;
        }
    }
}

mermaid += `\`\`\`\n`;

const finalMarkdown = `# 경제 판단력 교과서 전체 TASK 의존성 상세 다이어그램\n\n` + 
`본 다이어그램은 \`0. TASK_LIST.md\`에 정의된 모든 태스크 간의 의존성을 파싱하여 렌더링한 것입니다.\n\n` + 
`> 💡 **참고**: 전체 194개의 노드와 연결선이 모두 그려져 있으므로, 렌더링에 다소 시간이 걸리거나 에디터에 따라 넓은 화면이 필요할 수 있습니다.\n\n` + 
mermaid;

fs.writeFileSync('0. TASK_DEPENDENCY_GRAPH.md', finalMarkdown);
console.log(`Generated graph with ${tasks.length} tasks and ${edgesAdded} edges.`);
