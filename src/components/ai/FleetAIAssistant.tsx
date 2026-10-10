import React, { useState } from 'react';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  X, 
  HelpCircle, 
  Search, 
  Laptop, 
  Wrench, 
  ShieldAlert, 
  DollarSign, 
  CheckCircle2, 
  Key,
  ExternalLink,
  ChevronRight,
  ArrowRight,
  AlertTriangle,
  Clock,
  UserCheck,
  Building2,
  RefreshCw
} from 'lucide-react';
import { 
  getGeminiClient, 
  isGeminiAvailable, 
  setGeminiApiKey, 
  getGeminiApiKey,
  generateContentWithFallback
} from '../../lib/ai/gemini-client';
import { useAssets } from '../../context/AssetContext';
import { useAuth } from '../../context/AuthContext';
import { Asset, MaintenanceRecord, CheckoutRecord } from '../../types';
import { generateSketchGraph } from '../AssetManager';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  suggestedFilter?: {
    status?: string;
    branch?: string;
    query?: string;
  };
  actionLabel?: string;
  matchedAssets?: Asset[];
}

interface FleetAIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyFilter?: (filter: { status?: string; branch?: string; query?: string }) => void;
  onInspectAsset?: (asset: Asset) => void;
}

export const FleetAIAssistant: React.FC<FleetAIAssistantProps> = ({
  isOpen,
  onClose,
  onApplyFilter,
  onInspectAsset
}) => {
  const { assets = [], maintenances = [], checkouts = [] } = useAssets();
  const { currentUser, currentOrg, currentOrgBranches = [] } = useAuth();

  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getGeminiApiKey());
  const [showKeyModal, setShowKeyModal] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `👋 Hello ${currentUser?.fullName?.split(' ')[0] || 'Admin'}! I am your **Live AI Fleet Assistant**.\n\nI have complete, real-time access to all **${assets?.length || 0} hardware assets**, active maintenance tickets, and checkouts registered across **${currentOrg?.name || 'your organization'}**.\n\nAsk me about equipment assignments, repair statuses, warranty audits, or financial book values!`,
      timestamp: 'Just now'
    }
  ]);

  if (!isOpen) return null;

  const handleSendMessage = async (customText?: string) => {
    const queryText = (customText || inputPrompt).trim();
    if (!queryText || loading) return;

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputPrompt('');
    setLoading(true);

    try {
      // 1. Prepare rich live telemetry snapshot from the current system state
      const safeAssets = assets || [];
      const safeCheckouts = checkouts || [];
      const safeMaintenances = maintenances || [];
      const safeBranches = currentOrgBranches || [];

      const compactAssets = safeAssets.map((a: Asset) => ({
        code: a.assetCode,
        name: a.name,
        model: a.model || '',
        category: a.categoryName || '',
        branch: a.branchName || '',
        status: a.status,
        condition: a.condition,
        assignedTo: a.assignedToUserName || 'In Storage / Available',
        purchaseCost: a.purchaseCost || 0,
        currentValue: a.currentValue || a.purchaseCost || 0,
        warrantyExpiry: a.warrantyExpiry || 'N/A',
        serial: a.serialNumber || ''
      }));

      const compactCheckouts = safeCheckouts.slice(0, 30).map((c: CheckoutRecord) => ({
        code: c.assetCode,
        name: c.assetName,
        borrower: c.checkedOutToUserName,
        borrowedDate: c.checkedOutAt,
        expectedReturn: c.expectedReturnDate,
        status: c.status
      }));

      const compactMaintenances = safeMaintenances.slice(0, 30).map((m: MaintenanceRecord) => ({
        code: m.assetCode,
        name: m.assetName,
        type: m.type,
        issue: m.description,
        technician: m.assignedTechnician,
        status: m.status,
        priority: m.priority,
        cost: m.cost
      }));

      let assistantResponseText = '';
      let matchedAssetCodes: string[] = [];
      let suggestedFilter: Message['suggestedFilter'] = undefined;
      let actionLabel: string | undefined = undefined;

      let usedFallbackHeuristic = false;
      const hasApiKey = isGeminiAvailable();

      if (hasApiKey) {
        try {
          // Build grounded system prompt for Gemini
          const prompt = `
You are the AI Fleet Operations Director for "${currentOrg?.name || 'Enterprise'}".
You have direct, real-time access to the organization's live IT asset database.

LIVE SYSTEM RECORDS (${safeAssets.length} total assets registered):
${JSON.stringify({
  organization: currentOrg?.name,
  branches: safeBranches.map((b: any) => b.name),
  totalFleetCount: safeAssets.length,
  totalBookValueUSD: safeAssets.reduce((sum: number, a: Asset) => sum + (a.currentValue || a.purchaseCost || 0), 0),
  activeAssets: safeAssets.filter((a: Asset) => a.status === 'ACTIVE').length,
  inRepairAssets: safeAssets.filter((a: Asset) => a.status === 'REPAIR').length,
  damagedAssets: safeAssets.filter((a: Asset) => a.status === 'DAMAGED').length,
  inventory: compactAssets,
  activeCheckouts: compactCheckouts,
  maintenanceTickets: compactMaintenances
}, null, 2)}

USER QUESTION: "${queryText}"

INSTRUCTIONS:
1. Answer strictly and accurately using the live system data above. Cite exact asset codes (e.g., AST-1001), model names, serial numbers, branch locations, repair issues, and custodian names.
2. Provide a clean, structured, markdown-formatted response (using bold text, bullet points, or concise tables).
3. If the user asks about specific equipment, repairs, custodians, or warranties, identify the relevant asset codes.
4. At the very end of your response, output a structured JSON block enclosed strictly in \`\`\`system_action ... \`\`\` formatted as follows:
\`\`\`system_action
{
  "matchedAssetCodes": ["AST-XXXX", "AST-YYYY"],
  "suggestedFilter": { "status": "REPAIR", "branch": "Sydney HQ", "query": "Dell" },
  "actionLabel": "Filter matching items in Inventory"
}
\`\`\`
If no specific assets or filters apply, omit the system_action block.
`;

          const rawResult = await generateContentWithFallback(prompt);

          // Parse out system_action JSON block if present
          const actionMatch = rawResult.match(/```system_action\s*([\s\S]*?)\s*```/);
          if (actionMatch && actionMatch[1]) {
            try {
              const parsedAction = JSON.parse(actionMatch[1]);
              matchedAssetCodes = parsedAction.matchedAssetCodes || [];
              suggestedFilter = parsedAction.suggestedFilter;
              actionLabel = parsedAction.actionLabel;
            } catch {}
            // Strip out the system_action block from display text
            assistantResponseText = rawResult.replace(/```system_action[\s\S]*?```/, '').trim();
          } else {
            assistantResponseText = rawResult.trim();
          }
        } catch (apiErr: any) {
          console.warn('Gemini API call failed, falling back to grounded telemetry:', apiErr);
          usedFallbackHeuristic = true;
        }
      }

      if (!hasApiKey || usedFallbackHeuristic) {
        // Grounded offline analytical heuristic matching
        const lower = queryText.toLowerCase();

        if (lower.includes('repair') || lower.includes('broken') || lower.includes('damaged') || lower.includes('maintenance')) {
          const repairAssets = safeAssets.filter((a: Asset) => a.status === 'REPAIR' || a.status === 'DAMAGED');
          matchedAssetCodes = repairAssets.map((a: Asset) => a.assetCode);
          suggestedFilter = { status: 'REPAIR' };
          actionLabel = `Filter ${repairAssets.length} Repair Items in Inventory`;
          
          assistantResponseText = `### 🛠️ Live Maintenance & Repair Summary\n\n` +
            `Identified **${repairAssets.length} devices** requiring service or flagged as damaged across **${safeBranches.length} branches**:\n\n` +
            repairAssets.map((a: Asset) => `- **${a.name}** (\`${a.assetCode}\`) — Branch: *${a.branchName}* | Status: \`${a.status}\``).join('\n') +
            `\n\nTechnician review is recommended to prevent operational downtime.`;
        } else if (lower.includes('checkout') || lower.includes('borrow') || lower.includes('who has') || lower.includes('custod')) {
          const assignedAssets = safeAssets.filter((a: Asset) => !!a.assignedToUserName);
          matchedAssetCodes = assignedAssets.map((a: Asset) => a.assetCode);
          actionLabel = `View ${assignedAssets.length} Assigned Devices`;

          assistantResponseText = `### 👤 Equipment Custody & Checkouts\n\n` +
            `There are currently **${assignedAssets.length} assets** actively assigned to team members:\n\n` +
            assignedAssets.slice(0, 8).map((a: Asset) => `- **${a.name}** (\`${a.assetCode}\`) → **${a.assignedToUserName}** (*${a.branchName}*)`).join('\n') +
            (assignedAssets.length > 8 ? `\n- *...and ${assignedAssets.length - 8} more assigned units.*` : '');
        } else if (lower.includes('warranty') || lower.includes('expire')) {
          const now = new Date();
          const expiring = safeAssets.filter((a: Asset) => {
            if (!a.warrantyExpiry) return false;
            const diffDays = (new Date(a.warrantyExpiry).getTime() - now.getTime()) / (1000 * 3600 * 24);
            return diffDays <= 180;
          });
          matchedAssetCodes = expiring.map((a: Asset) => a.assetCode);
          actionLabel = `Audit ${expiring.length} Expiring Warranties`;

          assistantResponseText = `### ⏳ Warranty Expiration Audit\n\n` +
            `Identified **${expiring.length} assets** with warranty expiring within the next 6 months:\n\n` +
            expiring.slice(0, 6).map((a: Asset) => `- **${a.name}** (\`${a.assetCode}\`) — Expires: \`${a.warrantyExpiry}\` (*${a.branchName}*)`).join('\n') +
            `\n\nWe advise contacting hardware vendors for warranty extensions.`;
        } else if (lower.includes('macbook') || lower.includes('apple')) {
          const apples = safeAssets.filter((a: Asset) => a.name.toLowerCase().includes('macbook') || a.model?.toLowerCase().includes('macbook') || a.name.toLowerCase().includes('apple'));
          matchedAssetCodes = apples.map((a: Asset) => a.assetCode);
          suggestedFilter = { query: 'MacBook' };
          actionLabel = `Show ${apples.length} Apple Devices`;

          assistantResponseText = `### 💻 Apple Fleet Telemetry\n\n` +
            `You have **${apples.length} Apple devices** registered across the enterprise with a total value of **$${apples.reduce((sum: number, a: Asset) => sum + (a.currentValue || a.purchaseCost || 0), 0).toLocaleString()}**.\n\n` +
            apples.slice(0, 5).map((a: Asset) => `- **${a.name}** (\`${a.assetCode}\`) — Holder: *${a.assignedToUserName || 'In Storage'}*`).join('\n');
        } else {
          // General valuation and branch rollup
          const totalVal = safeAssets.reduce((sum: number, a: Asset) => sum + (a.currentValue || a.purchaseCost || 0), 0);
          assistantResponseText = `### 📊 Organization Fleet Telemetry\n\n` +
            `- **Organization**: ${currentOrg?.name || 'Enterprise'}\n` +
            `- **Total Hardware Assets**: **${safeAssets.length} units**\n` +
            `- **Total Net Book Value**: **$${totalVal.toLocaleString()}**\n` +
            `- **Active Facilities**: ${safeBranches.map((b: any) => b.name).join(', ')}\n` +
            `- **Active Repairs**: ${safeMaintenances.filter((m: any) => m.status === 'IN_PROGRESS').length} tickets\n\n` +
            `*Tip: You can ask specific questions like "Who has MacBook laptops?", "What's in repair in Sydney?", or "List server hardware".*`;
        }
      }

      // Resolve matched asset objects from codes
      const matchedAssets = matchedAssetCodes.length > 0 
        ? assets.filter((a: Asset) => matchedAssetCodes.includes(a.assetCode) || matchedAssetCodes.includes(a.id))
        : [];

      const botMsg: Message = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: assistantResponseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedFilter,
        actionLabel,
        matchedAssets: matchedAssets.slice(0, 6)
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (err: any) {
      console.error('AI assistant error:', err);
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ **AI Query Notice**: ${err.message || 'Unable to connect to Gemini API'}.\n\nYou can click the 🔑 **Key** icon above to update your Gemini API key, or use built-in offline telemetry searches.`,
        timestamp: 'Just now'
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const samplePrompts = [
    'Who currently has equipment checked out?',
    'Find all hardware assets currently in repair',
    'Which device warranties expire this year?',
    'What is the total value of our laptop fleet?',
    'Show all assets located at Sydney HQ'
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] bg-slate-900/95 backdrop-blur-2xl border-l border-emerald-500/30 shadow-2xl flex flex-col transition-all duration-300">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-100 text-sm">Gemini AI Fleet Assistant</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-semibold">
                {isGeminiAvailable() ? 'Gemini 2.5 Live' : 'Grounded Telemetry'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Live intelligence for {assets.length} assets in {currentOrg?.name || 'organization'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowKeyModal(!showKeyModal)}
            title="Configure Gemini API Key"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
          >
            <Key className="w-4 h-4 text-emerald-400" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors border border-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* API Key Modal / Drawer */}
      {showKeyModal && (
        <div className="p-4 bg-slate-950 border-b border-emerald-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5" /> Google Gemini API Key
            </h4>
            <button
              onClick={() => setShowKeyModal(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Done
            </button>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Enter your Google Gemini API key to enable live generative conversational reasoning grounded in your system database:
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="flex-1 px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
            />
            <button
              onClick={() => {
                setGeminiApiKey(apiKeyInput);
                setShowKeyModal(false);
              }}
              className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors cursor-pointer"
            >
              Save Key
            </button>
          </div>
        </div>
      )}

      {/* Message History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-3 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.sender === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-emerald-400" />
              </div>
            )}

            <div
              className={`max-w-[88%] rounded-2xl p-4 text-xs leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-emerald-600 text-white rounded-br-none shadow-md shadow-emerald-600/20'
                  : 'bg-slate-800/90 text-slate-200 rounded-bl-none border border-slate-700/60 shadow-lg'
              }`}
            >
              {/* Message Body */}
              <div className="prose prose-invert prose-xs max-w-none space-y-2">
                <p className="whitespace-pre-line leading-relaxed">{m.text}</p>
              </div>

              {/* Grounded Matched Assets Cards */}
              {m.matchedAssets && m.matchedAssets.length > 0 && (
                <div className="mt-3.5 pt-3 border-t border-slate-700/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                      <Laptop className="w-3 h-3" /> Grounded System Assets ({m.matchedAssets.length})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {m.matchedAssets.map((ast) => (
                      <div
                        key={ast.id}
                        onClick={() => onInspectAsset && onInspectAsset(ast)}
                        className="p-2.5 rounded-xl bg-slate-950/70 hover:bg-slate-950 border border-slate-700/80 hover:border-emerald-500/50 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img 
                            src={ast.imageUrl || generateSketchGraph(ast.categoryName || '', ast.name)} 
                            alt={ast.name}
                            className="w-8 h-8 rounded-lg object-cover bg-slate-900 border border-slate-800 shrink-0" 
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-200 group-hover:text-emerald-400 text-xs truncate">
                              {ast.name}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate">
                              {ast.assetCode} • {ast.branchName} • {ast.assignedToUserName || 'Available'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                            ast.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                            ast.status === 'REPAIR' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                            'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}>
                            {ast.status}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 1-Click Action / Filter Button */}
              {((m.suggestedFilter && onApplyFilter) || m.actionLabel) && (
                <div className="mt-3.5 pt-2.5 border-t border-slate-700/40">
                  <button
                    onClick={() => {
                      if (m.suggestedFilter && onApplyFilter) {
                        onApplyFilter(m.suggestedFilter);
                      } else if (m.matchedAssets && m.matchedAssets.length > 0 && onApplyFilter) {
                        onApplyFilter({ query: m.matchedAssets[0]?.assetCode || '' });
                      }
                      onClose();
                    }}
                    className="w-full py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-200 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>{m.actionLabel || 'Apply Filter in Fleet Manager'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="mt-2 text-[9px] text-right opacity-60 font-mono">{m.timestamp}</div>
            </div>

            {m.sender === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-4 h-4 text-slate-300" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start items-center">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Bot className="w-4 h-4 text-emerald-400 animate-spin" />
            </div>
            <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl rounded-bl-none p-4 text-xs text-slate-300 flex items-center gap-2.5 shadow-md">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span>Gemini is analyzing your live system records & telemetry...</span>
            </div>
          </div>
        )}
      </div>

      {/* Suggested Quick Prompts */}
      <div className="px-4 py-2.5 bg-slate-950/50 border-t border-slate-800">
        <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-emerald-400" /> Quick System Inquiries:
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {samplePrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(prompt)}
              className="text-[10px] px-3 py-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 whitespace-nowrap transition-colors flex-shrink-0 cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/90">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Ask AI about fleet assets, checkouts, repairs..."
            className="flex-1 px-4 py-2.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors shadow-inner"
          />
          <button
            type="submit"
            disabled={!inputPrompt.trim() || loading}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl font-medium transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
