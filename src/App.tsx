import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Image as ImageIcon, 
  Camera, 
  Languages, 
  Copy, 
  Check, 
  Loader2, 
  RefreshCw,
  ChevronRight,
  LayoutGrid,
  Sparkles,
  History,
  X,
  Trash2,
  FileText
} from 'lucide-react';
import { cn } from './lib/utils';
import { analyzeImage, generateStoryboardPrompt, inferSceneFromBoth } from './services/gemini';

const SHOT_CATEGORIES = [
  "电影叙事 (Cinematic Narrative)",
  "动作序列 (Action Sequence)",
  "情感特写 (Emotional Close-ups)",
  "建筑/景观 (Architectural / Landscape)",
  "时尚/人像 (Fashion / Portrait)",
  "科幻/未来 (Sci-Fi / Futuristic)",
  "恐怖/悬疑 (Horror / Suspense)"
];

interface HistoryItem {
  id: string;
  description: string;
  category: string;
  prompts: { en: string; zh: string };
  timestamp: number;
}

export default function App() {
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [description, setDescription] = useState("");
  const [shotPromptsInput, setShotPromptsInput] = useState("");
  const [category, setCategory] = useState(SHOT_CATEGORIES[0]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPrompts, setGeneratedPrompts] = useState<{ en: string; zh: string } | null>(null);
  const [language, setLanguage] = useState<'en' | 'zh'>('zh');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('storyboard_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('storyboard_history', JSON.stringify(history));
  }, [history]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages = acceptedFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setImages(prev => {
      const combined = [...prev, ...newImages];
      if (combined.length > 10) {
        alert("最多支持 10 张参考图，已自动截取前 10 张。");
        return combined.slice(0, 10);
      }
      return combined;
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true
  } as any);

  const removeImage = (index: number) => {
    setImages(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleInferScene = async () => {
    if (images.length === 0 && !shotPromptsInput) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const imagePromises = images.map(img => {
        return new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const imgElement = new Image();
            imgElement.onload = () => {
              const canvas = document.createElement('canvas');
              let width = imgElement.width;
              let height = imgElement.height;
              
              // 限制最大尺寸为 1600px，保持比例
              const MAX_SIZE = 1600;
              if (width > height) {
                if (width > MAX_SIZE) {
                  height *= MAX_SIZE / width;
                  width = MAX_SIZE;
                }
              } else {
                if (height > MAX_SIZE) {
                  width *= MAX_SIZE / height;
                  height = MAX_SIZE;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(imgElement, 0, 0, width, height);
              
              // 压缩质量为 0.8
              const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
              resolve({
                base64: compressedBase64.split(',')[1],
                mimeType: 'image/jpeg'
              });
            };
            imgElement.onerror = () => reject(new Error("图片加载失败"));
            imgElement.src = e.target?.result as string;
          };
          reader.onerror = () => reject(new Error("图片读取失败"));
          reader.readAsDataURL(img.file);
        });
      });

      const base64Images = await Promise.all(imagePromises);
      
      const desc = await inferSceneFromBoth(base64Images, shotPromptsInput);
      
      setDescription(desc);
    } catch (error) {
      console.error("Analysis failed", error);
      setAnalysisError(error instanceof Error ? error.message : "分析过程出现未知错误");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if (!description) return;
    setIsGenerating(true);
    try {
      const result = await generateStoryboardPrompt(description, category);
      setGeneratedPrompts(result);
      
      // Add to history
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        description,
        category,
        prompts: result,
        timestamp: Date.now()
      };
      setHistory(prev => [newItem, ...prev].slice(0, 50)); // Keep last 50
    } catch (error) {
      console.error("Generation failed", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (!generatedPrompts) return;
    const text = language === 'en' ? generatedPrompts.en : generatedPrompts.zh;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadFromHistory = (item: HistoryItem) => {
    setGeneratedPrompts(item.prompts);
    setDescription(item.description);
    setCategory(item.category);
    setShowHistory(false);
  };

  const clearHistory = () => {
    if (confirm("确定要清空所有历史记录吗？")) {
      setHistory([]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-stone-50">
      {/* Left Panel: Configuration */}
      <div className="w-full md:w-[450px] bg-white border-r border-stone-200 p-8 flex flex-col gap-8 overflow-y-auto h-screen sticky top-0">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center">
              <LayoutGrid className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">分镜提示词架构师</h1>
          </div>
          <button 
            onClick={() => setShowHistory(true)}
            className="p-2 hover:bg-stone-100 rounded-full transition-colors relative"
          >
            <History className="w-5 h-5 text-stone-600" />
            {history.length > 0 && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            )}
          </button>
        </header>

        <section className="space-y-6">
          <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-6">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-widest text-stone-500 flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-amber-500" /> 1. 增强型场景参考源 (支持 10 图 + 10 分镜)
              </label>
              <button
                onClick={handleInferScene}
                disabled={(images.length === 0 && !shotPromptsInput) || isAnalyzing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-lg text-[10px] font-bold hover:bg-stone-800 disabled:opacity-50 transition-all shadow-sm"
              >
                {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                一键反推核心场景
              </button>
            </div>

            <div className="space-y-4">
              <div 
                {...getRootProps()} 
                className={cn(
                  "relative aspect-video rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center p-4 text-center bg-white",
                  isDragActive ? "border-stone-900 bg-stone-50" : "border-stone-200 hover:border-stone-400",
                )}
              >
                <input {...getInputProps()} />
                <div className="space-y-2">
                  <div className="w-10 h-10 bg-stone-50 rounded-full flex items-center justify-center mx-auto border border-stone-100">
                    <Upload className="w-5 h-5 text-stone-400" />
                  </div>
                  <p className="text-xs font-medium text-stone-600">点击或拖拽参考图 (多张)</p>
                </div>
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden group border border-stone-200 shadow-sm">
                      <img src={img.preview} alt="Reference" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                value={shotPromptsInput}
                onChange={(e) => setShotPromptsInput(e.target.value)}
                placeholder="粘贴已有的分镜描述（支持多达 10 个分镜内容）或关键词（可选）..."
                className="w-full h-24 p-4 text-sm bg-white rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-stone-900/10 resize-none shadow-sm"
              />
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-widest text-stone-400">2. 核心场景描述 (Master Scene)</label>
            <div className="relative">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="点击上方“一键反推”自动生成，或在此手动输入..."
                className={cn(
                  "w-full h-32 p-4 text-sm bg-stone-50 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-stone-900/10 resize-none",
                  analysisError ? "border-red-200 bg-red-50/30" : "border-stone-200"
                )}
              />
              {isAnalyzing && (
                <div className="absolute inset-0 bg-stone-50/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl gap-4">
                  <div className="flex flex-col items-center gap-3 text-stone-600">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="text-xs font-bold tracking-widest uppercase">正在使用 Pro 模型深度分析中...</span>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsAnalyzing(false);
                      setAnalysisError("已手动取消分析");
                    }}
                    className="px-3 py-1 bg-white border border-stone-200 rounded-full text-[10px] font-bold text-stone-400 hover:text-stone-900 hover:border-stone-900 transition-all"
                  >
                    取消分析
                  </button>
                </div>
              )}
              {analysisError && !isAnalyzing && (
                <div className="absolute bottom-2 right-2 flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-2">
                  <X className="w-3 h-3 cursor-pointer" onClick={() => setAnalysisError(null)} />
                  <span className="text-[10px] font-bold">{analysisError}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <label className="text-xs font-bold uppercase tracking-widest text-stone-400">3. 分镜类别 (Shot Category)</label>
          <div className="grid grid-cols-1 gap-2">
            {SHOT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border text-sm transition-all",
                  category === cat 
                    ? "bg-stone-900 border-stone-900 text-white shadow-lg" 
                    : "bg-white border-stone-200 text-stone-600 hover:border-stone-400"
                )}
              >
                <span>{cat}</span>
                {category === cat && <ChevronRight className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </section>

        <button
          onClick={handleGenerate}
          disabled={!description || isGenerating}
          className="w-full py-4 bg-stone-900 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>正在生成 3x3 网格提示词...</span>
            </>
          ) : (
            <>
              <Camera className="w-5 h-5" />
              <span>4. 生成分镜网格提示词</span>
            </>
          )}
        </button>
      </div>

      {/* Right Panel: Result */}
      <div className="flex-1 p-8 md:p-16 flex flex-col items-center justify-center relative">
        <AnimatePresence mode="wait">
          {generatedPrompts ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl space-y-8"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setLanguage('zh')}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-all",
                      language === 'zh' ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-200"
                    )}
                  >
                    中文
                  </button>
                  <button
                    onClick={() => setLanguage('en')}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-all",
                      language === 'en' ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-200"
                    )}
                  >
                    English
                  </button>
                </div>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? "已复制" : "复制提示词"}</span>
                </button>
              </div>

              <div className="bg-white p-8 md:p-12 rounded-3xl shadow-2xl border border-stone-200 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <ImageIcon className="w-24 h-24" />
                </div>
                
                <div className="relative space-y-6">
                  <div className="space-y-4">
                    <p className="text-lg md:text-xl font-serif italic text-stone-800 leading-relaxed">
                      {language === 'en' 
                        ? generatedPrompts.en.split('\n\n')[0] 
                        : generatedPrompts.zh.split('\n\n')[0]}
                    </p>
                    <div className="h-px bg-stone-100 w-full" />
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {(language === 'en' ? generatedPrompts.en : generatedPrompts.zh)
                      .split('\n')
                      .filter(line => line.startsWith('Shot') || line.startsWith('镜头'))
                      .map((shot, idx) => (
                        <div key={idx} className="data-grid-row">
                          <span className="font-mono text-[10px] uppercase tracking-tighter text-stone-400 pt-1">
                            {shot.split(':')[0]}
                          </span>
                          <span className="text-sm text-stone-600 leading-relaxed">
                            {shot.split(':')[1]}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <p className="text-xs text-stone-400 flex items-center gap-2">
                  <RefreshCw className="w-3 h-3" />
                  由 AI Studio 生成 • 分镜提示词架构师 v1.5 Pro
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center space-y-6 max-w-md"
            >
              <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mx-auto border border-stone-100">
                <ImageIcon className="w-10 h-10 text-stone-300" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-stone-800">准备好开始了吗？</h2>
                <p className="text-stone-500">在左侧提供参考图或分镜描述，点击“一键反推”即可提取核心场景。</p>
              </div>
              <div className="pt-8 flex items-center justify-center gap-8 opacity-30 grayscale">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-full border-2 border-stone-900" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">3x3 网格</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-lg border-2 border-stone-900 flex items-center justify-center">
                    <span className="text-[10px] font-bold">16:9</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest">画幅</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-lg border-2 border-stone-900 flex items-center justify-center">
                    <Languages className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest">中英双语</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* History Slide-over */}
        <AnimatePresence>
          {showHistory && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowHistory(false)}
                className="absolute inset-0 bg-stone-900/20 backdrop-blur-sm z-40"
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute top-0 right-0 w-full md:w-[400px] h-full bg-white shadow-2xl z-50 flex flex-col"
              >
                <div className="p-6 border-bottom border-stone-100 flex items-center justify-between">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <History className="w-5 h-5" />
                    历史记录
                  </h3>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={clearHistory}
                      className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                      title="清空历史"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setShowHistory(false)}
                      className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {history.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-stone-400 space-y-2">
                      <History className="w-12 h-12 opacity-20" />
                      <p className="text-sm">暂无历史记录</p>
                    </div>
                  ) : (
                    history.map((item) => (
                      <div 
                        key={item.id}
                        onClick={() => loadFromHistory(item)}
                        className="p-4 rounded-xl border border-stone-100 hover:border-stone-300 hover:shadow-md transition-all cursor-pointer group bg-stone-50/50"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 bg-stone-200 rounded text-stone-600">
                            {item.category.split(' ')[0]}
                          </span>
                        </div>
                        <p className="text-sm text-stone-700 line-clamp-2 mb-2 font-medium">
                          {item.description}
                        </p>
                        <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-xs text-stone-900 font-semibold flex items-center gap-1">
                            加载记录 <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
