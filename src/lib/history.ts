const MAX_HISTORY_LENGTH = 3800;

export const appendHistory = (currentHistory: string | null, message: string) => {
    const nowInBrazil = new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short"
    });

    const entry = `[${nowInBrazil}] ${message}`;
    let newHistory = currentHistory ? `${currentHistory}\n${entry}` : entry;

    if (newHistory.length > MAX_HISTORY_LENGTH) {
        const logs = newHistory.split("\n");
        
        while (logs.join("\n").length > MAX_HISTORY_LENGTH && logs.length > 1) {
            logs.shift(); 
        }
        
        // Add a marker so admins know older logs were truncated
        if (!logs[0].startsWith("... [Histórico mais antigo arquivado]")) {
            logs.unshift("... [Histórico mais antigo arquivado]");
        }
        
        newHistory = logs.join("\n");
    }

    return newHistory;
};