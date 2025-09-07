import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  //MouseEvent as ReactMouseEvent,
} from 'react';
import { DEFAULT_TASK_TYPES, STORAGE_KEY_CUSTOM_TASK_TYPES, TaskType } from '../types/TaskTypes';
import { MessageSquare } from 'lucide-react'; // Added MessageSquare
import '../styles/contentarea/UserInstructions.css';

/**
 * Props interface for the UserInstructions component
 * @property {string} instructions - The current instructions text
 * @property {function} setInstructions - Function to update instructions
 * @property {string} selectedTaskType - The ID of the selected task type
 */
interface UserInstructionsProps {
  instructions: string;
  setInstructions: (value: string) => void;
  selectedTaskType: string;
  onSendToAIClicked: (instructions: string) => void; // <-- NEW PROP
}

/**
 * UserInstructions Component
 *
 * This component provides a text area for users to enter custom instructions
 * that will be appended to the end of the copied content. This is useful for
 * adding context, requirements, or special notes when sharing code snippets.
 *
 * The component now also loads predefined prompts based on the selected task type.
 *
 * @param {string} instructions - Current instructions text value
 * @param {function} setInstructions - State setter function for updating instructions
 * @param {string} selectedTaskType - The ID of the selected task type
 * @returns {JSX.Element} - The rendered component
 */
const UserInstructions = ({
  instructions,
  setInstructions,
  selectedTaskType,
  onSendToAIClicked, // <-- ACCEPT PROP
}: UserInstructionsProps): JSX.Element => {
  const [allTaskTypes, setAllTaskTypes] = useState<TaskType[]>(DEFAULT_TASK_TYPES);

  // State for resizing
  const [instructionsHeight, setInstructionsHeight] = useState(126); // Default height
  const [instructionsWidth, setInstructionsWidth] = useState(100); // Default width percentage
  const [containerHeight, setContainerHeight] = useState<number | null>(null); // Dynamic container height
  const [containerVPadding, setContainerVPadding] = useState(0); // Sum of top+bottom padding
  const [isResizingVertical, setIsResizingVertical] = useState(false);
  const [isResizingHorizontal, setIsResizingHorizontal] = useState(false);
  const [isResizingCorner, setIsResizingCorner] = useState(false);

  // Initial mouse position for resize tracking
  const initialMousePosRef = useRef({ x: 0, y: 0 });
  const initialContainerHeightRef = useRef<number>(0);
  // Container ref for width calculation
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Min/max constraints
  const MIN_HEIGHT = 50;
  const MAX_HEIGHT = 500;
  const MIN_WIDTH_PERCENT = 20;
  const MAX_WIDTH_PERCENT = 100;

  // Load custom task types
  useEffect(() => {
    const storedTaskTypes = localStorage.getItem(STORAGE_KEY_CUSTOM_TASK_TYPES);
    let combinedTaskTypes = [...DEFAULT_TASK_TYPES]; // Start with defaults

    if (storedTaskTypes) {
      try {
        const parsedCustomTasks = JSON.parse(storedTaskTypes) as TaskType[];
        // Filter out any default tasks that might have the same ID as a custom task to give custom priority
        const defaultTasksFiltered = DEFAULT_TASK_TYPES.filter(
          (defaultTask) => !parsedCustomTasks.some((customTask) => customTask.id === defaultTask.id)
        );
        combinedTaskTypes = [...defaultTasksFiltered, ...parsedCustomTasks];
        // console.log('Combined task types:', combinedTaskTypes);
      } catch (error) {
        console.error('Error parsing or merging custom task types from localStorage:', error);
        // Fallback to just defaults if parsing/merging fails
        combinedTaskTypes = [...DEFAULT_TASK_TYPES];
      }
    }
    setAllTaskTypes(combinedTaskTypes);
  }, []); // Empty dependency array means this runs once on mount

  // Update instructions when task type changes
  useEffect(() => {
    const currentTask = allTaskTypes.find((task) => task.id === selectedTaskType);
    if (currentTask) {
      setInstructions(currentTask.prompt || '');
    } else {
      // If selectedTaskType is not found (e.g., after deleting a custom task type)
      // fall back to a sensible default, like the first task or a specific 'none' or 'default-general' task
      // For now, let's try to find a task with id 'default-general' or the first task if not found.
      const fallbackTask =
        allTaskTypes.find((task) => task.id === 'default-general') || allTaskTypes[0];
      setInstructions(fallbackTask?.prompt || '');
      // If selectedTaskType was valid but its prompt was empty, it would have set to '' above.
      // This else block handles cases where selectedTaskType ID itself is no longer in allTaskTypes.
    }
  }, [selectedTaskType, setInstructions, allTaskTypes]);

  // Resize handlers
  const handleVerticalResizeStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsResizingVertical(true);
      initialMousePosRef.current.y = e.clientY;
      initialContainerHeightRef.current = containerHeight ?? instructionsHeight + containerVPadding;
    },
    [containerHeight, instructionsHeight, containerVPadding]
  );

  const handleHorizontalResizeStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizingHorizontal(true);
    initialMousePosRef.current.x = e.clientX;
  }, []);

  const handleCornerResizeStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizingCorner(true);
    initialMousePosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Handle resize effects
  useEffect(() => {
    let animationFrameId: number;

    const handleResize = (e: MouseEvent) => {
      if (!isResizingVertical && !isResizingHorizontal && !isResizingCorner) return;

      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(() => {
        // Handle vertical resizing from the top (resize container and instructionsHeight)
        if (isResizingVertical || isResizingCorner) {
          const deltaY = e.clientY - initialMousePosRef.current.y;
          let newContainerHeight =
            (containerHeight ?? instructionsHeight + containerVPadding) - deltaY;
          const minContainerHeight = MIN_HEIGHT + containerVPadding;
          const maxContainerHeight = MAX_HEIGHT + containerVPadding;
          newContainerHeight = Math.max(
            minContainerHeight,
            Math.min(newContainerHeight, maxContainerHeight)
          );
          setContainerHeight(newContainerHeight);
          setInstructionsHeight(newContainerHeight - containerVPadding);
          initialMousePosRef.current.y = e.clientY;
        }

        // Handle horizontal resizing
        if ((isResizingHorizontal || isResizingCorner) && containerRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect();
          const containerWidth = containerRect.width;
          const deltaX = e.clientX - initialMousePosRef.current.x;

          const percentageDelta = (deltaX / containerWidth) * 100;
          const newWidthPercent = Math.max(
            MIN_WIDTH_PERCENT,
            Math.min(instructionsWidth + percentageDelta, MAX_WIDTH_PERCENT)
          );

          setInstructionsWidth(newWidthPercent);
          initialMousePosRef.current.x = e.clientX;
        }
      });
    };

    const handleResizeEnd = () => {
      cancelAnimationFrame(animationFrameId);
      setIsResizingVertical(false);
      setIsResizingHorizontal(false);
      setIsResizingCorner(false);
    };

    // Add event listeners if resizing
    if (isResizingVertical || isResizingHorizontal || isResizingCorner) {
      document.addEventListener('mousemove', handleResize, { passive: true });
      document.addEventListener('mouseup', handleResizeEnd);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [
    isResizingVertical,
    isResizingHorizontal,
    isResizingCorner,
    instructionsHeight,
    instructionsWidth,
    containerHeight,
    containerVPadding,
  ]);

  // Save resize dimensions to localStorage
  useEffect(() => {
    localStorage.setItem('pastemax-instructions-width', instructionsWidth.toString());
    localStorage.setItem('pastemax-instructions-height', instructionsHeight.toString());
    if (containerHeight !== null) {
      localStorage.setItem('pastemax-instructions-container-height', containerHeight.toString());
    }
  }, [instructionsWidth, instructionsHeight, containerHeight]);

  // Load saved dimensions and calculate container padding on mount
  useEffect(() => {
    const savedWidth = localStorage.getItem('pastemax-instructions-width');
    const savedHeight = localStorage.getItem('pastemax-instructions-height');
    const savedContainerHeight = localStorage.getItem('pastemax-instructions-container-height');

    let initialHeight = 126;
    if (savedHeight) {
      initialHeight = parseInt(savedHeight, 10);
      setInstructionsHeight(initialHeight);
    }

    if (savedWidth) {
      setInstructionsWidth(parseFloat(savedWidth));
    }

    // Calculate container vertical padding
    if (containerRef.current) {
      const styles = getComputedStyle(containerRef.current);
      const paddingTop = parseFloat(styles.paddingTop) || 0;
      const paddingBottom = parseFloat(styles.paddingBottom) || 0;
      const vPad = paddingTop + paddingBottom;
      setContainerVPadding(vPad);

      // Set initial container height
      if (savedContainerHeight) {
        setContainerHeight(parseInt(savedContainerHeight, 10));
        setInstructionsHeight(parseInt(savedContainerHeight, 10) - vPad);
      } else {
        setContainerHeight(initialHeight + vPad);
      }
    }
  }, []);

  // Update containerVPadding when component mounts or styles change
  useEffect(() => {
    if (containerRef.current) {
      const computedStyle = getComputedStyle(containerRef.current);
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
      setContainerVPadding(paddingTop + paddingBottom);

      // Initialize containerHeight if not already set from localStorage
      if (localStorage.getItem('pastemax-instructions-container-height') === null) {
        setContainerHeight(instructionsHeight + paddingTop + paddingBottom);
      }
    }
  }, [instructionsHeight]); // Recalculate if instructionsHeight changes and no saved container height

  const handleSendClick = () => {
    if (instructions.trim()) {
      onSendToAIClicked(instructions.trim());
    }
  };

  return (
    <>
      {/* Section header */}
      <div className="content-header">
        <div className="content-title">User Instructions</div>
      </div>

      {/* Instructions input container */}
      <div
        className="user-instructions-container"
        ref={containerRef}
        style={containerHeight !== null ? { height: `${containerHeight}px` } : undefined}
      >
        <div
          className="user-instructions"
          style={{
            width: `${instructionsWidth}%`,
            height: `${instructionsHeight}px`,
          }}
        >
          <textarea
            id="userInstructionsInput"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Enter your instructions here... These will be appended to the copied file content."
            style={{
              height: '100%',
            }}
          />

          {/* Resize handles */}
          <div
            className="instructions-resize-handle-vertical"
            onMouseDown={handleVerticalResizeStart}
            title="Drag to resize vertically"
          ></div>

          <div
            className="instructions-resize-handle-horizontal"
            onMouseDown={handleHorizontalResizeStart}
            title="Drag to resize horizontally"
          ></div>

          <div
            className="instructions-resize-handle-corner"
            onMouseDown={handleCornerResizeStart}
            title="Drag to resize"
          ></div>
        </div>
        <div className="user-instructions-actions">
          <button
            className="send-to-ai-button app-button primary-button"
            onClick={handleSendClick}
            disabled={!instructions.trim()}
            title="Send these instructions to the AI Chat"
          >
            <MessageSquare size={16} /> Send to AI
          </button>
        </div>
      </div>
    </>
  );
};

export default UserInstructions;
