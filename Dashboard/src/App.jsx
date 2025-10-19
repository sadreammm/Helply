import React, { useState, useEffect } from 'react';
import { Activity, Brain, Users, TrendingUp, Shield, Target, AlertCircle, CheckCircle, Clock, Database, BarChart3, Lock } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, color, change }) => {
  const colorMap = {
    purple: 'from-purple-600 to-purple-500',
    blue: 'from-blue-600 to-blue-500',
    green: 'from-green-600 to-green-500',
    pink: 'from-pink-600 to-pink-500',
    orange: 'from-orange-600 to-orange-500'
  };

  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 hover:border-gray-700 transition">
      <div className="flex items-center justify-between mb-2">
        <div className={`bg-gradient-to-r ${colorMap[color]} p-2 rounded`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <p className="text-gray-400 text-xs mb-1">{title}</p>
        <p className="text-xl font-bold mb-0.5">{value}</p>
        <p className="text-xs text-green-400">{change}</p>
      </div>
    </div>
  );
};

const OnBoardDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [liveData, setLiveData] = useState({
    feedbackSignals: 147,
    completionTime: 6.8,
    knowledgePins: 23,
    exitCaptures: 2,
    rlPolicies: 5
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveData(prev => ({
        ...prev,
        feedbackSignals: prev.feedbackSignals + Math.floor(Math.random() * 3)
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'rl', label: 'RL Engine', icon: Brain },
    { id: 'knowledge', label: 'Knowledge Base', icon: Database },
    { id: 'offboarding', label: 'Exit Capture', icon: Users },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp }
  ];

  const mockHeatmap = [
    { task: 'GitHub Repo Creation', step: 2, stuck: 12, severity: 'high' },
    { task: 'GitHub PR', step: 4, stuck: 8, severity: 'medium' },
    { task: 'GitHub Clone', step: 1, stuck: 5, severity: 'low' }
  ];

  const mockKnowledgePins = [
    { id: 1, title: 'How to create PR with signed commits', author: 'John D.', trust: 0.92, version: 3 },
    { id: 2, title: 'GitHub Actions workflow setup', author: 'Sarah K.', trust: 0.88, version: 2 },
    { id: 3, title: 'Repository naming conventions', author: 'Mike R.', trust: 0.95, version: 1 }
  ];

  const mockRLPolicies = [
    { task: 'github_repo_creation', role: 'junior', episodes: 45, completion: 0.87, topAction: 'detailed_hint' },
    { task: 'github_pr', role: 'junior', episodes: 32, completion: 0.82, topAction: 'highlight' },
    { task: 'github_repo_creation', role: 'senior', episodes: 18, completion: 0.95, topAction: 'tooltip' }
  ];

  const analyticsData = {
    weeklyCompletion: [
      { day: 'Mon', rate: 75 },
      { day: 'Tue', rate: 82 },
      { day: 'Wed', rate: 78 },
      { day: 'Thu', rate: 85 },
      { day: 'Fri', rate: 88 },
      { day: 'Sat', rate: 70 },
      { day: 'Sun', rate: 65 }
    ],
    feedbackTrends: [
      { type: 'Got it', count: 234, color: 'bg-green-500' },
      { type: 'Show me where', count: 89, color: 'bg-yellow-500' },
      { type: 'Correct', count: 156, color: 'bg-blue-500' },
      { type: 'Incorrect', count: 34, color: 'bg-red-500' }
    ]
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

      <div className="mb-6 pb-4 border-b border-gray-800">
        <h1 className="text-3xl md:text-4xl font-bold mb-1 text-purple-400">
          ONBOARD.AI
        </h1>
        <p className="text-gray-500 text-sm">Dashboard</p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded text-sm whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard
              title="Feedback Signals"
              value={liveData.feedbackSignals}
              icon={Activity}
              color="purple"
              change="+12 today"
            />
            <StatCard
              title="Avg. Completion"
              value={`${liveData.completionTime} days`}
              icon={Clock}
              color="blue"
              change="-2.3 days"
            />
            <StatCard
              title="Knowledge Pins"
              value={liveData.knowledgePins}
              icon={Database}
              color="green"
              change="+5 this week"
            />
            <StatCard
              title="RL Policies"
              value={liveData.rlPolicies}
              icon={Brain}
              color="pink"
              change="87% accuracy"
            />
            <StatCard
              title="Exit Captures"
              value={liveData.exitCaptures}
              icon={Shield}
              color="orange"
              change="100% secured"
            />
          </div>

          <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-400" />
              Live Onboarding Session
            </h2>
            <div className="space-y-3">
              <div className="bg-gray-800 rounded-lg p-4 border-l-4 border-purple-500">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium">John Doe - GitHub Repo Creation</p>
                    <p className="text-xs text-gray-400 mt-1">Step 2 of 3 • Junior Developer</p>
                  </div>
                  <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded">In Progress</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-300 mt-3">
                  <CheckCircle className="w-4 h-4 text-purple-400" />
                  RL optimized: <span className="text-purple-300 font-mono bg-gray-900 px-1 rounded">detailed_hint</span>
                </div>
                <div className="mt-3 bg-gray-900 rounded p-3 text-xs border border-gray-700">
                  <p className="text-gray-300">💡 Based on 45 similar sessions, detailed hint increased completion by 23%</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button className="bg-green-600 hover:bg-green-700 text-white py-2 rounded transition text-sm flex items-center justify-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Got it
                </button>
                <button className="bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded transition text-sm flex items-center justify-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Show me
                </button>
                <button className="bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition text-sm flex items-center justify-center gap-1">
                  <Target className="w-3 h-3" />
                  Correct
                </button>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4">Onboarding Heatmap</h2>
            <div className="space-y-3">
              {mockHeatmap.map((item, idx) => (
                <div key={idx} className="bg-gray-800 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{item.task}</p>
                      <p className="text-xs text-gray-400">Step {item.step}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      item.severity === 'high' ? 'bg-red-600 text-white' :
                      item.severity === 'medium' ? 'bg-yellow-600 text-white' :
                      'bg-green-600 text-white'
                    }`}>
                      {item.stuck} stuck
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        item.severity === 'high' ? 'bg-red-500' :
                        item.severity === 'medium' ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${(item.stuck / 15) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'rl' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
            <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              RL Policies
            </h2>
            <p className="text-gray-400 text-xs mb-4">System learns from feedback</p>
            
            <div className="space-y-3">
              {mockRLPolicies.map((policy, idx) => (
                <div key={idx} className="bg-gray-800 rounded p-4 border border-gray-700">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-purple-400 text-sm">{policy.task}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Role: {policy.role}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-400">{Math.round(policy.completion * 100)}%</p>
                      <p className="text-xs text-gray-500">completion</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mt-3">
                    <div className="bg-gray-900 rounded p-2 border border-gray-700">
                      <p className="text-gray-400 mb-0.5">Episodes</p>
                      <p className="font-semibold">{policy.episodes}</p>
                    </div>
                    <div className="bg-gray-900 rounded p-2 border border-gray-700">
                      <p className="text-gray-400 mb-0.5">Top action</p>
                      <p className="font-mono text-purple-300 text-xs">{policy.topAction}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'knowledge' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Database className="w-5 h-5 text-purple-400" />
                  Knowledge Pins
                </h2>
                <p className="text-gray-400 text-xs mt-1">Team knowledge base</p>
              </div>
              <button className="bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded transition text-sm">
                + New
              </button>
            </div>
            
            <div className="space-y-3">
              {mockKnowledgePins.map((pin) => (
                <div key={pin.id} className="bg-gray-800 rounded p-4 border border-gray-700">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="font-medium text-sm mb-1">{pin.title}</h3>
                      <p className="text-xs text-gray-400">By {pin.author} • v{pin.version}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-xs text-gray-400">Trust</p>
                      <p className="text-lg font-bold text-green-400">{Math.round(pin.trust * 100)}%</p>
                    </div>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-1.5 mt-2">
                    <div 
                      className="h-1.5 rounded-full bg-green-500"
                      style={{ width: `${pin.trust * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
              <Shield className="w-4 h-4 text-purple-400" />
              Federated Learning
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-400 mb-1">Model Version</p>
                <p className="font-mono text-purple-300">v1.2.3</p>
              </div>
              <div>
                <p className="text-gray-400 mb-1">Privacy</p>
                <p className="text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Preserved
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'offboarding' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
            <div className="mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                Exit Knowledge Capture
              </h2>
              <p className="text-gray-400 text-xs mt-1">Preserve knowledge before departure</p>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-800 rounded p-4 border border-orange-600">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium">Sarah Johnson</p>
                    <p className="text-xs text-gray-400 mt-1">Senior Dev • Leaving in 14 days</p>
                  </div>
                  <span className="text-xs bg-orange-600 text-white px-2 py-1 rounded">
                    High Risk
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div className="bg-gray-900 rounded p-2 border border-gray-700">
                    <p className="text-gray-400 mb-0.5">Pins</p>
                    <p className="font-bold text-lg">12</p>
                  </div>
                  <div className="bg-gray-900 rounded p-2 border border-gray-700">
                    <p className="text-gray-400 mb-0.5">Workflows</p>
                    <p className="font-bold text-lg">8</p>
                  </div>
                  <div className="bg-gray-900 rounded p-2 border border-gray-700">
                    <p className="text-gray-400 mb-0.5">Contacts</p>
                    <p className="font-bold text-lg">15</p>
                  </div>
                </div>
                <button className="w-full mt-3 bg-purple-600 hover:bg-purple-700 py-2 rounded transition text-sm">
                  Generate Handover
                </button>
              </div>

              <div className="bg-gray-800 rounded p-4 border border-green-600">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium">Michael Chen</p>
                    <p className="text-xs text-gray-400 mt-1">PM • Captured 3 days ago</p>
                  </div>
                  <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                    Secured
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-300 mt-2">
                  <Lock className="w-3 h-3 text-green-400" />
                  Ready for successor transfer
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              Weekly Completion Rate
            </h2>
            <div className="h-64 flex items-end justify-between gap-3 px-2">
              {analyticsData.weeklyCompletion.map((data, idx) => {
                const barHeight = (data.rate / 100) * 200;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                    <span className="text-xs text-gray-400 mb-1">{data.rate}%</span>
                    <div 
                      className="w-full bg-purple-600 rounded-t hover:bg-purple-500 transition"
                      style={{ height: `${barHeight}px` }}
                    ></div>
                    <span className="text-xs text-gray-500 mt-1">{data.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              Feedback Distribution
            </h2>
            <div className="space-y-3">
              {analyticsData.feedbackTrends.map((feedback, idx) => (
                <div key={idx} className="bg-gray-800 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm">{feedback.type}</p>
                    <p className="text-lg font-bold">{feedback.count}</p>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${feedback.color}`}
                      style={{ width: `${(feedback.count / 250) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-green-600 p-2 rounded">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <p className="text-gray-400 text-xs">Improvement</p>
              </div>
              <p className="text-2xl font-bold text-green-400">+12%</p>
              <p className="text-xs text-gray-500 mt-1">vs last month</p>
            </div>
            
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-blue-600 p-2 rounded">
                  <Clock className="w-4 h-4 text-white" />
                </div>
                <p className="text-gray-400 text-xs">Time Saved</p>
              </div>
              <p className="text-2xl font-bold text-blue-400">2.3 days</p>
              <p className="text-xs text-gray-500 mt-1">per onboarding</p>
            </div>
            
            <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-purple-600 p-2 rounded">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <p className="text-gray-400 text-xs">RL Accuracy</p>
              </div>
              <p className="text-2xl font-bold text-purple-400">87%</p>
              <p className="text-xs text-gray-500 mt-1">improving</p>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};

export default OnBoardDashboard;