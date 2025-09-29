import React, { useRef, useEffect } from 'react';

const Modal = ({ isOpen, hasCloseBtn = true, onClose, children, size = 'medium' }) => {
  const modalRef = useRef(null);

  useEffect(() => {
    const modalElement = modalRef.current;
    if (modalElement) {
      if (isOpen) {
        if (!modalElement.open) {
          modalElement.showModal();
        }
      } else {
        if (modalElement.open) {
          modalElement.close();
        }
      }
    }
  }, [isOpen]);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  // Add a click handler to the dialog itself to close it when the backdrop is clicked.
  const handleBackdropClick = (event) => {
    if (event.target === modalRef.current) {
      onClose();
    }
  };

  const sizeClasses = {
    small: 'max-w-md',
    medium: 'max-w-xl',
    large: 'max-w-3xl',
    xlarge: 'max-w-5xl'
  };

  return (
    <dialog 
      ref={modalRef} 
      onKeyDown={handleKeyDown} 
      onClick={handleBackdropClick}
      onClose={onClose} // The native dialog triggers this on Esc
      className={`p-0 rounded-lg shadow-xl backdrop:bg-black backdrop:bg-opacity-50 ${sizeClasses[size] || sizeClasses.medium}`}
    >
      <div className="relative">
        {hasCloseBtn && (
          <button 
            className="absolute top-2 right-2 text-gray-500 hover:text-gray-800 z-10" 
            onClick={onClose}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        )}
        {children}
      </div>
    </dialog>
  );
};

export default Modal;
