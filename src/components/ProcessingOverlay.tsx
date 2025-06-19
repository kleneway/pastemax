import { Loader } from 'lucide-react';
import '../styles/components/ProcessingOverlay.css';

interface ProcessingOverlayProps {
  isVisible: boolean;
  title?: string;
  message?: string;
}

const ProcessingOverlay = ({ isVisible, title = "Processing Files", message = "Calculating precise tokens for copying..." }: ProcessingOverlayProps) => {
  if (!isVisible) return null;

  return (
    <div className="processing-overlay">
      <div className="processing-overlay-content">
        <Loader size={48} className="processing-overlay-spinner" />
        <h2>{title}</h2>
        <p>{message}</p>
      </div>
    </div>
  );
};

export default ProcessingOverlay;