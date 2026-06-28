import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { publishWorkflowApi } from './publishWorkflowApi';
import './PublishWizard.css';

interface WizardStep {
  id: number;
  title: string;
  description: string;
}

const steps: WizardStep[] = [
  { id: 1, title: '选择版本', description: '选择要发布的版本' },
  { id: 2, title: '选择环境', description: '选择目标部署环境' },
  { id: 3, title: '预览确认', description: '预览发布内容' },
  { id: 4, title: '发布执行', description: '执行发布流程' },
];

export function PublishWizard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const appId = parseInt(id || '0');

  const [currentStep, setCurrentStep] = useState(1);
  const [publishData, setPublishData] = useState({
    version: '',
    environment: 'production',
    notes: '',
  });
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<any>(null);

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const result = await publishWorkflowApi.createPublishWorkflow(appId, publishData);
      setPublishResult(result);
      setCurrentStep(4);
    } catch (error) {
      console.error('发布失败:', error);
      alert('发布失败，请重试');
    } finally {
      setPublishing(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="step-content">
            <h3>选择版本</h3>
            <div className="form-group">
              <label>版本号</label>
              <input
                type="text"
                placeholder="例如: 1.0.0"
                value={publishData.version}
                onChange={(e) =>
                  setPublishData({ ...publishData, version: e.target.value })
                }
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="step-content">
            <h3>选择环境</h3>
            <div className="env-options">
              {['development', 'staging', 'production'].map((env) => (
                <div
                  key={env}
                  className={`env-option ${
                    publishData.environment === env ? 'selected' : ''
                  }`}
                  onClick={() => setPublishData({ ...publishData, environment: env })}
                >
                  <div className="env-name">{env}</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="step-content">
            <h3>预览确认</h3>
            <div className="preview-info">
              <div className="info-row">
                <span className="label">版本:</span>
                <span className="value">{publishData.version}</span>
              </div>
              <div className="info-row">
                <span className="label">环境:</span>
                <span className="value">{publishData.environment}</span>
              </div>
            </div>
            <div className="form-group">
              <label>发布说明</label>
              <textarea
                rows={4}
                placeholder="描述本次发布的内容..."
                value={publishData.notes}
                onChange={(e) =>
                  setPublishData({ ...publishData, notes: e.target.value })
                }
              />
            </div>
          </div>
        );

      case 4:
        return (
          <div className="step-content">
            <h3>发布完成</h3>
            {publishResult ? (
              <div className="success-message">
                <div className="success-icon">✓</div>
                <p>应用已成功发布！</p>
                <div className="result-info">
                  <p>工作流 ID: {publishResult.workflowId}</p>
                </div>
              </div>
            ) : (
              <div className="loading-message">
                <div className="spinner"></div>
                <p>正在发布...</p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="publish-wizard">
      <div className="wizard-header">
        <h1>发布向导</h1>
        <button className="btn-close" onClick={() => navigate(-1)}>
          ✕
        </button>
      </div>

      <div className="wizard-steps">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`step ${currentStep === step.id ? 'active' : ''} ${
              currentStep > step.id ? 'completed' : ''
            }`}
          >
            <div className="step-number">{step.id}</div>
            <div className="step-info">
              <div className="step-title">{step.title}</div>
              <div className="step-description">{step.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="wizard-body">{renderStepContent()}</div>

      <div className="wizard-footer">
        <button
          className="btn-secondary"
          onClick={handlePrev}
          disabled={currentStep === 1 || currentStep === 4}
        >
          上一步
        </button>
        <div className="footer-spacer"></div>
        {currentStep < 3 && (
          <button
            className="btn-primary"
            onClick={handleNext}
            disabled={!publishData.version && currentStep === 1}
          >
            下一步
          </button>
        )}
        {currentStep === 3 && (
          <button
            className="btn-publish"
            onClick={handlePublish}
            disabled={publishing}
          >
            {publishing ? '发布中...' : '开始发布'}
          </button>
        )}
        {currentStep === 4 && publishResult && (
          <button className="btn-primary" onClick={() => navigate(-1)}>
            完成
          </button>
        )}
      </div>
    </div>
  );
}
