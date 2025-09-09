import './Content.css';
import { iconsImgs } from '../../utils/images';


const Content = () => {
    return (
        <div className='main-content'>
            <div className="main-content-top">
                <div className="content-top-left">
                    <button type="button" className="sidebar-toggler" /*onClick={() => toggleSidebar() }*/>
                        <img /*src={ iconsImgs.menu }*/ alt="" />
                    </button>
                    <h3 className="content-top-title">Dashboard</h3>
                </div>
                <div className="content-top-btns">
                    <button type="button" className="search-btn content-top-btn">
                        <img /*src={ iconsImgs.search }*/ alt="" />
                    </button>
                    <button className="notification-btn content-top-btn">
                        <img /*src={ iconsImgs.bell }*/ alt=""/>
                        <span className="notification-btn-dot"></span>
                    </button>
                </div>
            </div>

            <div className="main-content-holder">
                <div className='row'>
                    <div className="col-8">
                        <div className="grid-common">
                            <div className='grid-header'>
                                <div className='row'>
                                    <div className="col-4">
                                        <h3 className="grid-c-title-text">Portfolio waarde</h3>
                                    </div>
                                    <div className="col-4">
                                        <p className='text-xl text-right'><b>€ 123456</b></p>
                                        <p className='text-l text-right text-succes'>+ 54321 (+15,4%)</p>
                                    </div>
                                    <div className="col-4">
                                        <p className='text-l text-right'>1M   3M   6M   1Y   ALL</p>
                                    </div>
                                </div>
                            </div>
                            <div className="grid-content">
                                <div className="text-sm">
                                    <p>tab 1: grafiek van waarde van geinvesteerd vermogen (zonder beschikbaar bedrag) in euro</p>
                                    <p>tab 2: grafiek van waarde van geinvesteerd vermogen (zonder beschikbaar bedrag) in %</p>
                                    <p> == data van elke dag nodig</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="col-4">
                        <div className="grid-common">
                            <div className='grid-header'>
                                <div className="grid-c-title">
                                    <h3 className="grid-c-title-text">Mijn portfolio + zoekfilter</h3>
                                </div>
                            </div>
                            <div className="grid-table-content">
                                <table className='table'>
                                    <tr>
                                        <td><img className="stock-logo" src={ iconsImgs.menu } alt="" /></td>
                                        <td>
                                            <p className='text-l'><b>UNH</b> (UnitedHealth)</p>
                                            <p className='text-m'>Qty: <b>1,234</b></p>
                                        </td>
                                        <td>
                                            <p className='text-l text-right'><b>€ 1234567</b></p>
                                            <p className='text-m text-right text-succes'>+15,4%</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><img className="stock-logo" src={ iconsImgs.menu } alt="" /></td>
                                        <td>
                                            <p className='text-l'><b>SWKS</b> (Skyworks Solutions)</p>
                                            <p className='text-m'>Qty: <b>1,234</b></p>
                                        </td>
                                        <td>
                                            <p className='text-l text-right'><b>€ 1234567</b></p>
                                            <p className='text-m text-right text-succes'>+15,4%</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><img className="stock-logo" src={ iconsImgs.menu } alt="" /></td>
                                        <td>
                                            <p className='text-l'><b>GOOGL</b> (Alphabet Inc Class A)</p>
                                            <p className='text-m'>Qty: <b>1,234</b></p>
                                        </td>
                                        <td>
                                            <p className='text-l text-right'><b>€ 1234567</b></p>
                                            <p className='text-m text-right text-succes'>+15,4%</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><img className="stock-logo" src={ iconsImgs.menu } alt="" /></td>
                                        <td>
                                            <p className='text-l'><b>MNST</b> (Monster Beverage Corp)</p>
                                            <p className='text-m'>Qty: <b>1,234</b></p>
                                        </td>
                                        <td>
                                            <p className='text-l text-right'><b>€ 1234567</b></p>
                                            <p className='text-m text-right text-succes'>+15,4%</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><img className="stock-logo" src={ iconsImgs.menu } alt="" /></td>
                                        <td>
                                            <p className='text-l'><b>ADBE</b> (Adobe Systems Inc)</p>
                                            <p className='text-m'>Qty: <b>1,234</b></p>
                                        </td>
                                        <td>
                                            <p className='text-l text-right'><b>€ 1234567</b></p>
                                            <p className='text-m text-right text-succes'>+15,4%</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><img className="stock-logo" src={ iconsImgs.menu } alt="" /></td>
                                        <td>
                                            <p className='text-l'><b>NVDA</b> (Nvidia Corporation)</p>
                                            <p className='text-m'>Qty: <b>1,234</b></p>
                                        </td>
                                        <td>
                                            <p className='text-l text-right'><b>€ 1234567</b></p>
                                            <p className='text-m text-right text-succes'>+15,4%</p>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td><img className="stock-logo" src={ iconsImgs.menu } alt="" /></td>
                                        <td>
                                            <p className='text-l'><b>MSFT</b> (Microsoft)</p>
                                            <p className='text-m'>Qty: <b>1,234</b></p>
                                        </td>
                                        <td>
                                            <p className='text-l text-right'><b>€ 1234567</b></p>
                                            <p className='text-m text-right text-succes'>+15,4%</p>
                                        </td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
                <div className='row'>
                    <div className="col-4">
                        <div className="grid-common">
                            <div className='grid-header'>
                                <div className="grid-c-title">
                                    <h3 className="grid-c-title-text">NSDQ</h3>
                                </div>
                            </div>
                            <div className="grid-content">
                            </div>
                        </div>
                    </div>
                    <div className="col-4">
                        <div className="grid-common">
                            <div className='grid-header'>
                                <div className="grid-c-title">
                                    <h3 className="grid-c-title-text">World ETF</h3>
                                </div>
                            </div>
                            <div className="grid-content">
                            </div>
                        </div>
                    </div>
                </div>
                <div className='row'>
                    <div className="content-grid-two">
                        <div className="grid-two-item">
                            <div className="subgrid-two">
                                <h1>TODO</h1><br/>
                                <h2>aankoopregels</h2><br/>
                                <ul>
                                    <li>beschikbaar saldo</li>
                                    <li>* ideale portfolio (%)</li>
                                    <li>* koopmarge (absolute waarde) / 2</li>
                                    <li>* trend van intrinsieke waarde</li>
                                    <li>* verhouding van ip/hp</li>
                                    <li>* moving average factor</li>
                                </ul>
                            </div>
                        </div>

                        <div className="grid-two-item">
                            <div className="subgrid-two">
                                <p>test</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Content