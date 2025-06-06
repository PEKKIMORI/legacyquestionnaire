import React from 'react';
import Navbar from '~/components/Navbar';

const FinalDetails: React.FC = () => {
  return (
    <>
      <Navbar />
      <main className="flex justify-center items-center h-screen">
        <div className="relative">
          {/* This would be your circle with different segments */}
          {/* You would style this with CSS or inline styles as needed */}
          <div className="rounded-full border-4 border-black w-64 h-64 flex items-center justify-center">
            <div className="absolute inset-0 flex justify-center items-center">
              {/* Each of these would be a segment in your circle, style as needed */}
              <div className="w-1/2 h-1/2 bg-blue-500">Goal Oriented</div>
              <div className="w-1/2 h-1/2 bg-yellow-500">Self Care</div>
              <div className="w-1/2 h-1/2 bg-green-500">Versatile & Open</div>
              <div className="w-1/2 h-1/2 bg-red-500">Self Awareness</div>
              <div className="w-1/2 h-1/2 bg-purple-500">Selflessness</div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default FinalDetails;
