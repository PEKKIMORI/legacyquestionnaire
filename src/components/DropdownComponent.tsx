// DropdownComponent.tsx
import React, {useState} from 'react';
import { CountryDropdown } from 'react-country-region-selector';

const DropdownComponent = () => {
    const [country, setCountry] = useState('');
  
    return (
      <div>
        <CountryDropdown
          value={country}
          onChange={(val) => setCountry(val)}
          classes="w-full bg-[#E0ECFD66] text-[#333333] rounded p-2" />
      </div>
    );
  }

export default DropdownComponent;
