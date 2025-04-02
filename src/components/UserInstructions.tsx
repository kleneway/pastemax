import React from "react";

/**
 * Props interface for the UserInstructions component
 * @property {string} instructions - The current instructions text
 * @property {function} setInstructions - Function to update instructions
 */
interface UserInstructionsProps {
  instructions: string;
  setInstructions: (value: string) => void;
}

/**
 * UserInstructions Component
 * 
 * This component provides a text area for users to enter custom instructions
 * that will be appended to the end of the copied content. This is useful for
 * adding context, requirements, or special notes when sharing code snippets.
 * 
 * The instructions are rendered within <instructions> tags in the final output
 * after all selected file content.
 * 
 * @param {string} instructions - Current instructions text value
 * @param {function} setInstructions - State setter function for updating instructions
 * @returns {JSX.Element} - The rendered component
 */
const UserInstructions = ({
  instructions,
  setInstructions,
}: UserInstructionsProps): JSX.Element => {
  return (
    <>
      {/* Section header */}
      <div className="content-header">
        <div className="content-title">User Instructions</div>
      </div>
      
      {/* Instructions input container */}
      <div className="user-instructions-container">
        <div className="user-instructions">
          <textarea
            id="userInstructionsInput"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Enter your instructions here..."
            rows={4}
            style={{
              width: "100%",
              resize: "none",
            }}
          />
        </div>
      </div>
    </>
  );
};

export default UserInstructions;
