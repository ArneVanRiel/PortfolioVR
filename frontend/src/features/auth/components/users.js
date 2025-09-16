import React, { useState, useEffect } from 'react';

const GetUsers = () => {
    const [data, setData] = useState([])
    const [responseMessage, setResponseMessage] = useState('');
    const [userName, setUsername] = useState('');
    const [showChangeUserElements, setShowChangeUserElements] = useState(false);
    const [inputEmail, setInputEmail] = useState('')
    const [changeEmail, setChangeEmail] = useState({
        userName: '',
        userEmail: '',
    });

    const handleInputChange = (e) => {
        setInputEmail(e.target.value);
      };
    
      const handleNewUser = (e) => {
        setUsername(e.target.value);
      }
      const handleShowChangeUserElements = () => {
        setShowChangeUserElements(!showChangeUserElements); // Toggle the state
      };
    
    /*const postData = async () => {
        try {
            const response = await fetch('/api/changeUsers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(
                { userName: userName} // iets mis met userEmail, mssn ook rest van datacolommen, kan maar 1 karakter opslagen
                )
            });
    
            const data = await response.json();
            setResponseMessage(data.message);
        } catch (error) {
            console.error('Error sending POST request:', error);
        }
        };*/
        const postData = () => {
            fetch('/api/changeUsers', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(
                    { userName: userName} // iets mis met userEmail, mssn ook rest van datacolommen, kan maar 1 karakter opslagen
                    )
                })
                .then((response) => response.json())
                .then((data) => {
                    console.log('Data sent successfully:', data);
                })
                .catch((error) => {
                    console.error('Error sending data:', error);
                });
        }


    useEffect(() => {
        fetch('/api/getUsers')
        .then((response) => {
            if (!response.ok) {
            throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then((data) => setData(data))
        .catch((error) => console.error('Error fetching data:', error));
    });
    return (
        <>
        <table class="table tablesorter scrollbar to-do">
            <thead class="text-primary">
                <tr>
                    <th>Username</th>
                    <th>email</th>
                    <th></th>
                </tr>
            </thead>
            <tbody id="ontbrekendeData">
                {data.map((row) => (
                    <tr key={row.id}>
                        <td>{row.userName}</td>
                        <td><input type="text" ></input></td>
                        <td><button className="button to-do" name='changeEmail' onClick="">Change Email</button></td>
                    </tr>
                ))}
            </tbody>
        </table>
        <div>
            </div>
            <div className='row'>
              <label id='tickerSearchBox' style={{width:"105px"}}>user name:</label>
              <input type="text" value={userName} onChange={handleNewUser}></input>
              <button className="button" name='button' onClick={postData}>Add user</button>
              <button className="button" name='button' onClick={handleShowChangeUserElements}>Change user data</button>
              <button className="button" name='button' onClick="">Delete user</button>

            </div>
            <div className='row'>
                {showChangeUserElements && (
                    <div>
                        <label id='tickerSearchBox' style={{width:"105px"}}>update user name:</label>
                        <input type="text" placeholder={userName}></input>
                        <button className="button" name='button' onClick="">Bevestigen</button>
                    </div>

                )}
            </div>
            </>
    )
}

export default GetUsers;